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

module.exports = router;
