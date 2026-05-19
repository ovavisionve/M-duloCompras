const crypto = require('crypto');
const db = require('../database/connection');
const logger = require('../utils/logger');

/**
 * Verifica firma HMAC-SHA256. Acepta firmas con o sin prefijo "sha256=".
 * Devuelve true solo si la firma calculada coincide en tiempo constante.
 */
function verifySignature(rawBody, providedSignature, secret) {
  if (!providedSignature || !secret || !rawBody) return false;
  const sig = String(providedSignature).replace(/^sha256=/i, '').trim();
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Toma req.ip y la lista de IPs permitidas (CSV o array). Soporta IPv4/IPv6 exactos.
 * Si la lista está vacía, devuelve true (no se aplica filtro).
 */
function isIpAllowed(sourceIp, allowedIpsCsv) {
  if (!allowedIpsCsv) return true;
  const list = String(allowedIpsCsv)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0) return true;
  // Normalizar IPv4 mapeado en IPv6 (::ffff:1.2.3.4)
  const normalized = sourceIp?.replace(/^::ffff:/, '') || '';
  return list.includes(normalized) || list.includes(sourceIp);
}

/**
 * Intenta extraer los campos de un movimiento bancario del payload del banco.
 * Acepta múltiples nombres de campo porque no tenemos la spec final.
 */
function extractFields(payload) {
  const p = payload || {};
  const get = (...keys) => {
    for (const k of keys) {
      if (p[k] !== undefined && p[k] !== null && p[k] !== '') return p[k];
    }
    return null;
  };

  const accountNumber = get('account_number', 'accountNumber', 'cuenta', 'numeroCuenta', 'nroCuenta');
  const reference = get('reference', 'referencia', 'numero_referencia', 'nroReferencia', 'documento', 'nroDocumento');
  const amountRaw = get('amount', 'monto', 'Monto');
  const currency = get('currency', 'moneda', 'divisa') || 'VES';
  const eventType = get('event_type', 'eventType', 'tipo', 'tipoEvento', 'type');
  const description = get('description', 'descripcion', 'concepto');
  const dateRaw = get('date', 'fecha', 'fechaMovimiento', 'movement_date');
  const signRaw = get('sign', 'signo', 'naturaleza', 'tipoMovimiento');

  const amount = amountRaw != null ? parseFloat(amountRaw) : null;

  // Heurística para detectar débito vs crédito
  const signStr = String(signRaw || '').toLowerCase();
  const isDebit = signStr.includes('deb') || signStr === '-' || signStr === 'd';

  // Parseo de fecha tolerante (ISO o dd/mm/yyyy o yyyy-mm-dd)
  let movementDate = null;
  if (dateRaw) {
    const s = String(dateRaw);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) movementDate = s.slice(0, 10);
    else if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
      const [d, m, y] = s.split('/');
      movementDate = `${y}-${m}-${d}`;
    }
  }

  return {
    accountNumber: accountNumber ? String(accountNumber) : null,
    reference: reference ? String(reference) : null,
    amount,
    currency,
    eventType: eventType ? String(eventType) : null,
    description: description ? String(description) : null,
    movementDate,
    isDebit,
  };
}

/**
 * Identifica a qué organización pertenece la notificación.
 * Estrategia: 1) match por account_number en bfc_accounts; 2) match por secret HMAC.
 */
async function identifyOrganization({ accountNumber, rawBody, signature }) {
  // 1) Por número de cuenta
  if (accountNumber) {
    const acc = await db('bfc_accounts')
      .where({ account_number: accountNumber, is_active: true })
      .first();
    if (acc) {
      const cfg = await db('bfc_config').where({ id: acc.bfc_config_id }).first();
      if (cfg) return { org_id: cfg.organization_id, config: cfg, match: 'account_number' };
    }
  }

  // 2) Por secret HMAC: probar contra cada bfc_config con notification_secret activo
  if (rawBody && signature) {
    const configs = await db('bfc_config')
      .whereNotNull('notification_secret')
      .where({ is_active: true });
    for (const cfg of configs) {
      if (verifySignature(rawBody, signature, cfg.notification_secret)) {
        return { org_id: cfg.organization_id, config: cfg, match: 'signature' };
      }
    }
  }

  return { org_id: null, config: null, match: null };
}

/**
 * Si la notificación trae un movimiento, intenta crearlo en bank_movements.
 * Idempotente: dedupea por (bank_account_id, reference, movement_date).
 */
async function maybeCreateBankMovement({ orgId, fields }) {
  if (!orgId || !fields.accountNumber || fields.amount == null) return null;

  const acc = await db('bfc_accounts')
    .where({ account_number: fields.accountNumber, organization_id: orgId, is_active: true })
    .first();
  if (!acc || !acc.bank_account_id) return null;

  const movDate = fields.movementDate || new Date().toISOString().slice(0, 10);
  const amount = Math.abs(fields.amount);
  const debit = fields.isDebit ? amount : 0;
  const credit = fields.isDebit ? 0 : amount;

  if (fields.reference) {
    const exists = await db('bank_movements')
      .where({ bank_account_id: acc.bank_account_id, reference: fields.reference })
      .where('movement_date', movDate)
      .first();
    if (exists) return { id: exists.id, duplicate: true };
  }

  const [row] = await db('bank_movements').insert({
    bank_account_id: acc.bank_account_id,
    movement_date: movDate,
    reference: fields.reference || null,
    description: `[BFC push] ${fields.description || ''}`.trim().slice(0, 500),
    debit,
    credit,
    balance: null,
  }).returning(['id']);

  return { id: row.id, duplicate: false };
}

/**
 * Procesa una notificación entrante de extremo a extremo.
 * Devuelve el registro de bfc_notifications creado.
 */
async function processNotification({ rawBody, payload, headers, sourceIp }) {
  const fields = extractFields(payload);
  const signature = headers['x-bfc-signature'] || headers['x-signature'] || null;

  const { org_id, config, match } = await identifyOrganization({
    accountNumber: fields.accountNumber,
    rawBody,
    signature,
  });

  // Validar firma y IP a nivel de org si encontramos config
  let signatureValid = false;
  let allowed = true;
  let errorMessage = null;

  if (config) {
    if (config.notification_secret) {
      signatureValid = verifySignature(rawBody, signature, config.notification_secret);
      if (!signatureValid) {
        errorMessage = 'Firma HMAC inválida';
      }
    } else {
      // Si no se ha configurado secret, marcamos como no verificado pero no falla
      signatureValid = false;
    }
    if (config.notification_allowed_ips) {
      allowed = isIpAllowed(sourceIp, config.notification_allowed_ips);
      if (!allowed) errorMessage = errorMessage || 'IP origen no permitida';
    }
  } else if (match === null) {
    errorMessage = 'No se pudo asociar la notificación a una organización (sin match por cuenta ni firma)';
  }

  let status = 'received';
  let bankMovementId = null;

  if (!org_id) {
    status = 'orphan';
  } else if (!allowed || (config?.notification_secret && !signatureValid)) {
    status = 'error';
  } else {
    // Procesar el movimiento si aplica
    try {
      const result = await maybeCreateBankMovement({ orgId: org_id, fields });
      if (result) {
        bankMovementId = result.id;
        status = result.duplicate ? 'ignored' : 'processed';
      } else {
        status = 'ignored';
      }
    } catch (err) {
      logger.error('BFC notification: error creating bank_movement', err);
      status = 'error';
      errorMessage = err.message;
    }
  }

  const [row] = await db('bfc_notifications').insert({
    organization_id: org_id,
    event_type: fields.eventType,
    account_number: fields.accountNumber,
    reference: fields.reference,
    amount: fields.amount,
    currency: fields.currency,
    raw_payload: payload,
    headers,
    source_ip: sourceIp,
    signature_valid: signatureValid,
    status,
    bank_movement_id: bankMovementId,
    error_message: errorMessage,
  }).returning('*');

  return row;
}

module.exports = {
  verifySignature,
  isIpAllowed,
  extractFields,
  processNotification,
};
