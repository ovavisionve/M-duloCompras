const router = require('express').Router();
const db = require('../database/connection');
const { authenticate, authorize } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const bankingService = require('../services/bankingService');
const auditService = require('../services/auditService');

// GET /banking/bank-accounts
router.get('/bank-accounts', authenticate, async (req, res, next) => {
  try {
    const accounts = await db('bank_accounts').orderBy('bank_name');
    res.json({ success: true, data: accounts });
  } catch (err) { next(err); }
});

// POST /banking/bank-accounts
router.post('/bank-accounts', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const { bank_name, account_type, account_number, currency, initial_balance } = req.body;
    if (!bank_name || !account_type || !account_number || !currency) {
      throw new AppError('Todos los campos son requeridos', 400);
    }

    const [account] = await db('bank_accounts').insert({
      bank_name, account_type, account_number, currency,
      initial_balance: initial_balance || 0,
      current_balance: initial_balance || 0,
    }).returning('*');

    await auditService.logAction(req.user.id, 'bank_account', account.id, 'create', null, account, req.ip);
    res.status(201).json({ success: true, data: account });
  } catch (err) { next(err); }
});

// POST /banking/bank-accounts/:id/statements (import movements)
router.post('/bank-accounts/:id/statements', authenticate, authorize('admin', 'tesorero', 'contador'), async (req, res, next) => {
  try {
    const { movements } = req.body;
    if (!movements?.length) throw new AppError('Debe enviar al menos un movimiento', 400);
    const result = await bankingService.importMovements(req.params.id, movements);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

// GET /banking/bank-accounts/:id/movements
router.get('/bank-accounts/:id/movements', authenticate, async (req, res, next) => {
  try {
    const { from_date, to_date, status, page = 1, limit = 50 } = req.query;
    const query = db('bank_movements')
      .leftJoin('payments', 'bank_movements.matched_payment_id', 'payments.id')
      .where('bank_movements.bank_account_id', req.params.id)
      .select('bank_movements.*', 'payments.reference_number as payment_reference');

    if (from_date) query.where('bank_movements.movement_date', '>=', from_date);
    if (to_date) query.where('bank_movements.movement_date', '<=', to_date);
    if (status) query.where('bank_movements.reconciliation_status', status);

    const [{ count }] = await query.clone().count();
    const data = await query.orderBy('bank_movements.movement_date', 'desc').limit(limit).offset((page - 1) * limit);

    res.json({ success: true, data, pagination: { total: parseInt(count), page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) { next(err); }
});

// POST /banking/reconciliation/auto
router.post('/reconciliation/auto', authenticate, authorize('admin', 'tesorero', 'contador'), async (req, res, next) => {
  try {
    const { bank_account_id } = req.body;
    if (!bank_account_id) throw new AppError('ID de cuenta bancaria requerido', 400);
    const result = await bankingService.autoReconcile(bank_account_id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// POST /banking/reconciliation/manual
router.post('/reconciliation/manual', authenticate, authorize('admin', 'tesorero', 'contador'), async (req, res, next) => {
  try {
    const { movement_id, payment_id } = req.body;
    if (!movement_id || !payment_id) throw new AppError('IDs de movimiento y pago requeridos', 400);
    const result = await bankingService.manualReconcile(movement_id, payment_id, req.user.id, req.ip);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// GET /banking/reconciliation/report?period=MM/YYYY
router.get('/reconciliation/report', authenticate, async (req, res, next) => {
  try {
    const { bank_account_id, period } = req.query;
    if (!bank_account_id || !period) throw new AppError('Cuenta bancaria y período requeridos', 400);
    const report = await bankingService.getReconciliationReport(bank_account_id, period);
    res.json({ success: true, data: report });
  } catch (err) { next(err); }
});

// GET /banking/api-config
router.get('/api-config', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const configs = await db('config').whereIn('key', [
      'bank_api_provider', 'bank_api_url', 'bank_api_key', 'bank_api_enabled',
    ]);
    const data = {};
    configs.forEach((c) => { data[c.key] = c.value; });
    // Mask API key for display
    if (data.bank_api_key) {
      data.bank_api_key_masked = data.bank_api_key.slice(0, 6) + '****' + data.bank_api_key.slice(-4);
      delete data.bank_api_key;
    }
    data.is_configured = !!(data.bank_api_provider && data.bank_api_url);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// PUT /banking/api-config
router.put('/api-config', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { bank_api_provider, bank_api_url, bank_api_key, bank_api_enabled } = req.body;
    const allowedKeys = { bank_api_provider, bank_api_url, bank_api_key, bank_api_enabled: String(bank_api_enabled ?? 'false') };

    for (const [key, value] of Object.entries(allowedKeys)) {
      if (value === undefined) continue;
      const existing = await db('config').where({ key }).first();
      if (existing) {
        await db('config').where({ key }).update({ value: String(value), updated_at: new Date() });
      } else {
        await db('config').insert({ key, value: String(value), description: `Configuración API bancaria: ${key}` });
      }
    }

    await auditService.logAction(req.user.id, 'config', null, 'update', null, { bank_api_provider }, req.ip);
    res.json({ success: true, message: 'Configuración de API bancaria actualizada' });
  } catch (err) { next(err); }
});

// POST /banking/sync - Fetch movements from bank API
router.post('/sync', authenticate, authorize('admin', 'tesorero', 'contador'), async (req, res, next) => {
  try {
    const enabled = await db('config').where({ key: 'bank_api_enabled' }).first();
    if (enabled?.value !== 'true') {
      throw new AppError('La API bancaria no está habilitada. Configure la conexión en Configuración > API Bancaria.', 400, 'BANK_API_NOT_CONFIGURED');
    }

    const provider = (await db('config').where({ key: 'bank_api_provider' }).first())?.value;
    const apiUrl = (await db('config').where({ key: 'bank_api_url' }).first())?.value;
    const apiKey = (await db('config').where({ key: 'bank_api_key' }).first())?.value;

    if (!provider || !apiUrl || !apiKey) {
      throw new AppError('Configuración de API bancaria incompleta. Verifique proveedor, URL y clave API.', 400, 'BANK_API_INCOMPLETE');
    }

    // Placeholder: when the bank provides the real API, implement the fetch here.
    // For now, return a clear message indicating the integration point.
    throw new AppError(
      `Integración con ${provider} pendiente. La conexión a ${apiUrl} está configurada pero el adaptador de ${provider} aún no está implementado. Contacte al desarrollador para activar la integración.`,
      501,
      'BANK_API_NOT_IMPLEMENTED'
    );
  } catch (err) { next(err); }
});

module.exports = router;
