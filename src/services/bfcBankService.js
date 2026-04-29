const db = require('../database/connection');
const { AppError } = require('../middleware/errorHandler');
const { round2 } = require('../utils/helpers');
const logger = require('../utils/logger');
const crypto = require('crypto');

const ENCRYPTION_KEY = process.env.BFC_ENCRYPTION_KEY || 'comprar-ia-bfc-default-key-32ch';
const IV_LENGTH = 16;
const TOKEN_MARGIN_MINUTES = 10;

function encrypt(text) {
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const [ivHex, encrypted] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function formatDateBFC(date) {
  const d = new Date(date);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}${mm}${yy}`;
}

function parseBFCDate(bfcDate) {
  if (!bfcDate || bfcDate.length < 6) return null;
  const dd = bfcDate.slice(0, 2);
  const mm = bfcDate.slice(2, 4);
  const yy = bfcDate.slice(4, 6);
  const year = parseInt(yy) > 50 ? `19${yy}` : `20${yy}`;
  return `${year}-${mm}-${dd}`;
}

async function bfcFetch(config, url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (config.proxy_api_key) {
    headers['x-api-key'] = config.proxy_api_key;
  }
  return fetch(url, { ...options, headers });
}

async function getConfig(orgId) {
  return db('bfc_config').where({ organization_id: orgId }).first();
}

async function saveConfig(orgId, data) {
  const existing = await getConfig(orgId);
  const record = {
    base_url: data.base_url.replace(/\/+$/, ''),
    username: data.username,
    cedula: data.cedula,
    is_active: data.is_active !== false,
    auto_import: data.auto_import || false,
    proxy_api_key: data.proxy_api_key || null,
    organization_id: orgId,
  };
  if (data.password) {
    record.password_encrypted = encrypt(data.password);
  }

  if (existing) {
    if (!data.password) delete record.password_encrypted;
    if (data.proxy_api_key === undefined) delete record.proxy_api_key;
    record.updated_at = new Date();
    const [result] = await db('bfc_config').where({ id: existing.id }).update(record).returning('*');
    return result;
  }
  if (!data.password) throw new AppError('La contraseña es requerida', 400, 'MISSING_PASSWORD');
  const [result] = await db('bfc_config').insert(record).returning('*');
  return result;
}

async function deleteConfig(orgId) {
  await db('bfc_tokens').where({ organization_id: orgId }).del();
  await db('bfc_accounts').where({ organization_id: orgId }).del();
  await db('bfc_config').where({ organization_id: orgId }).del();
}

async function getAccounts(orgId) {
  return db('bfc_accounts')
    .leftJoin('bank_accounts', 'bfc_accounts.bank_account_id', 'bank_accounts.id')
    .where('bfc_accounts.organization_id', orgId)
    .select(
      'bfc_accounts.*',
      'bank_accounts.bank_name',
      'bank_accounts.account_number as local_account_number',
      'bank_accounts.currency as local_currency'
    );
}

async function saveAccount(orgId, data) {
  const config = await getConfig(orgId);
  if (!config) throw new AppError('BFC no está configurado', 400, 'NOT_CONFIGURED');

  const existing = await db('bfc_accounts')
    .where({ bfc_config_id: config.id, account_number: data.account_number })
    .first();

  if (existing) {
    const [result] = await db('bfc_accounts').where({ id: existing.id }).update({
      account_alias: data.account_alias || existing.account_alias,
      bank_account_id: data.bank_account_id || existing.bank_account_id,
      is_active: data.is_active !== undefined ? data.is_active : existing.is_active,
      updated_at: new Date(),
    }).returning('*');
    return result;
  }

  const [result] = await db('bfc_accounts').insert({
    bfc_config_id: config.id,
    account_number: data.account_number,
    account_alias: data.account_alias || null,
    bank_account_id: data.bank_account_id || null,
    is_active: true,
    organization_id: orgId,
  }).returning('*');
  return result;
}

async function deleteAccount(orgId, accountId) {
  await db('bfc_accounts').where({ id: accountId, organization_id: orgId }).del();
}

async function authenticate(orgId) {
  const existing = await db('bfc_tokens').where({ organization_id: orgId }).first();
  if (existing && new Date(existing.expires_at) > new Date(Date.now() + TOKEN_MARGIN_MINUTES * 60000)) {
    return existing.token;
  }

  const config = await getConfig(orgId);
  if (!config) throw new AppError('BFC no está configurado', 400, 'NOT_CONFIGURED');
  if (!config.is_active) throw new AppError('BFC está desactivado', 400, 'BFC_DISABLED');

  const password = decrypt(config.password_encrypted);
  const basicAuth = Buffer.from(`${config.username}:${password}`).toString('base64');

  const response = await bfcFetch(config, `${config.base_url}/Login/User`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${basicAuth}` },
  });

  if (!response.ok) {
    const text = await response.text();
    await logSync(orgId, null, 'login', 'error', 0, 0, `HTTP ${response.status}: ${text}`);
    throw new AppError(`Error de autenticación BFC: ${response.status}`, 401, 'BFC_AUTH_FAILED');
  }

  const data = await response.json();
  const token = data.token || data.Token || data;

  if (!token || typeof token !== 'string') {
    throw new AppError('Respuesta de autenticación inválida', 500, 'BFC_AUTH_INVALID');
  }

  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

  if (existing) {
    await db('bfc_tokens').where({ organization_id: orgId }).update({
      token, expires_at: expiresAt, updated_at: new Date(),
    });
  } else {
    await db('bfc_tokens').insert({
      organization_id: orgId, token, expires_at: expiresAt,
    });
  }

  return token;
}

async function testConnection(orgId) {
  const token = await authenticate(orgId);
  const config = await getConfig(orgId);

  const response = await bfcFetch(config, `${config.base_url}/Login/EchoTest`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new AppError('Echo test falló', 400, 'BFC_ECHO_FAILED');
  }

  return { connected: true, message: 'Conexión exitosa con BFC' };
}

async function getBalance(orgId, accountNumber) {
  const token = await authenticate(orgId);
  const config = await getConfig(orgId);

  const response = await bfcFetch(config, `${config.base_url}/Saldo/ObtenerSaldo`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      cedula: config.cedula,
      nroCuenta: accountNumber,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new AppError(`Error consultando saldo: ${text}`, 400, 'BFC_BALANCE_ERROR');
  }

  const data = await response.json();
  await logSync(orgId, accountNumber, 'balance', 'success', 1, 0, null, data);
  return data;
}

async function getMovements(orgId, accountNumber, options = {}) {
  const token = await authenticate(orgId);
  const config = await getConfig(orgId);

  let bandera = options.bandera || 1;
  let fechaInicio = '';
  let fechaFin = '';

  if (options.from_date && options.to_date) {
    bandera = 5;
    fechaInicio = formatDateBFC(options.from_date);
    fechaFin = formatDateBFC(options.to_date);

    const diffMs = new Date(options.to_date) - new Date(options.from_date);
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays > 62) {
      throw new AppError('El rango máximo es de 2 meses', 400, 'BFC_DATE_RANGE_EXCEEDED');
    }
  }

  const body = {
    cedula: config.cedula,
    numeroCuenta: accountNumber,
    fechaInicio,
    fechaFin,
    cantidadMovimiento: options.limit || 50,
    pagina: options.page || 1,
    Bandera: bandera,
  };

  const response = await bfcFetch(config, `${config.base_url}/Consulta/Movimiento`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    await logSync(orgId, accountNumber, 'movements', 'error', 0, 0, `HTTP ${response.status}: ${text}`);
    throw new AppError(`Error consultando movimientos: ${text}`, 400, 'BFC_MOVEMENTS_ERROR');
  }

  const data = await response.json();
  const movements = Array.isArray(data) ? data : (data.movimientos || data.Movimientos || []);

  await logSync(orgId, accountNumber, 'movements', 'success', movements.length, 0, null, { bandera, page: body.pagina });
  return { movements, raw: data };
}

async function importMovements(orgId, accountNumber, options = {}) {
  const bfcAccount = await db('bfc_accounts')
    .where({ account_number: accountNumber, organization_id: orgId, is_active: true })
    .first();

  if (!bfcAccount) throw new AppError('Cuenta BFC no configurada', 404, 'BFC_ACCOUNT_NOT_FOUND');
  if (!bfcAccount.bank_account_id) {
    throw new AppError('La cuenta BFC no está vinculada a una cuenta bancaria local', 400, 'BFC_ACCOUNT_NOT_LINKED');
  }

  const { movements } = await getMovements(orgId, accountNumber, options);

  if (!movements.length) {
    await logSync(orgId, accountNumber, 'import', 'success', 0, 0);
    return { fetched: 0, imported: 0, duplicates: 0 };
  }

  let imported = 0;
  let duplicates = 0;

  for (const mov of movements) {
    const reference = mov.referencia || mov.Referencia || mov.nroDocumento || mov.NroDocumento || '';
    const description = mov.descripcion || mov.Descripcion || mov.concepto || mov.Concepto || '';
    const amount = parseFloat(mov.monto || mov.Monto || 0);
    const movDate = parseBFCDate(mov.fecha || mov.Fecha) || new Date().toISOString().split('T')[0];

    const isDebit = (mov.tipoMovimiento || mov.TipoMovimiento || '').toLowerCase().includes('deb')
      || (mov.signo || mov.Signo) === '-'
      || (mov.naturaleza || mov.Naturaleza || '').toLowerCase() === 'd';

    const debit = isDebit ? Math.abs(amount) : 0;
    const credit = isDebit ? 0 : Math.abs(amount);

    const existingRef = reference ? await db('bank_movements')
      .where({ bank_account_id: bfcAccount.bank_account_id, reference })
      .where('movement_date', movDate)
      .first() : null;

    if (existingRef) {
      duplicates++;
      continue;
    }

    await db('bank_movements').insert({
      bank_account_id: bfcAccount.bank_account_id,
      movement_date: movDate,
      reference: reference || null,
      description: `[BFC] ${description}`.substring(0, 500),
      debit: round2(debit),
      credit: round2(credit),
      balance: mov.saldo != null ? parseFloat(mov.saldo || mov.Saldo || 0) : null,
    });
    imported++;
  }

  await logSync(orgId, accountNumber, 'import', 'success', movements.length, imported, null, { duplicates });

  if (imported > 0 && bfcAccount.bank_account_id) {
    const bankingService = require('./bankingService');
    try {
      await bankingService.autoReconcile(bfcAccount.bank_account_id);
    } catch (err) {
      logger.warn('Auto-reconcile after BFC import failed:', err.message);
    }
  }

  return { fetched: movements.length, imported, duplicates };
}

async function logSync(orgId, accountNumber, action, status, fetched, imported, error, metadata) {
  try {
    await db('bfc_sync_logs').insert({
      organization_id: orgId,
      account_number: accountNumber,
      action,
      status,
      records_fetched: fetched || 0,
      records_imported: imported || 0,
      error_message: error || null,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
  } catch (err) {
    logger.warn('Failed to log BFC sync:', err.message);
  }
}

async function getSyncLogs(orgId, filters = {}) {
  const query = db('bfc_sync_logs')
    .where({ organization_id: orgId })
    .orderBy('created_at', 'desc');

  if (filters.account_number) query.where('account_number', filters.account_number);
  if (filters.action) query.where('action', filters.action);
  if (filters.status) query.where('status', filters.status);

  const limit = parseInt(filters.limit) || 50;
  return query.limit(limit);
}

async function autoImportAll(orgId) {
  const config = await getConfig(orgId);
  if (!config?.is_active || !config?.auto_import) return null;

  const accounts = await db('bfc_accounts')
    .where({ organization_id: orgId, is_active: true })
    .whereNotNull('bank_account_id');

  const results = [];
  for (const acc of accounts) {
    try {
      const result = await importMovements(orgId, acc.account_number, { bandera: 1 });
      results.push({ account: acc.account_number, ...result });
    } catch (err) {
      results.push({ account: acc.account_number, error: err.message });
    }
  }
  return results;
}

module.exports = {
  getConfig,
  saveConfig,
  deleteConfig,
  getAccounts,
  saveAccount,
  deleteAccount,
  authenticate: authenticate,
  testConnection,
  getBalance,
  getMovements,
  importMovements,
  getSyncLogs,
  autoImportAll,
};
