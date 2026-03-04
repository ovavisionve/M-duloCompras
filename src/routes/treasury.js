const router = require('express').Router();
const db = require('../database/connection');
const { authenticate, authorize } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const treasuryService = require('../services/treasuryService');

// Only admin and tesorero can access

// GET /treasury/accounts - Internal accounts
router.get('/accounts', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const data = await treasuryService.getAccounts();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// GET /treasury/suppliers - Suppliers for dropdown
router.get('/suppliers', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const data = await db('suppliers').where({ is_active: true }).orderBy('business_name').select('id', 'business_name', 'rif');
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// GET /treasury/summary?period=MM/YYYY
router.get('/summary', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const { period } = req.query;
    if (!period) throw new AppError('Período requerido (MM/YYYY)', 400);
    const data = await treasuryService.getMonthlySummary(period);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ─── Cash Flow / Posición Cambiaria (MUST be before /:id) ───

// GET /treasury/cash/position - Current cash position with revaluation
router.get('/cash/position', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const data = await treasuryService.getCashPosition();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// GET /treasury/cash/flows - List cash flow movements
router.get('/cash/flows', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const result = await treasuryService.listCashFlows(req.query);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

// GET /treasury/cash/revaluation?from=&to= - Revaluation report
router.get('/cash/revaluation', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const data = await treasuryService.getRevaluationReport(from, to);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// POST /treasury/cash/flows - Record manual VES entry/exit
router.post('/cash/flows', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const data = await treasuryService.recordCashFlow(req.body, req.user.id, req.ip);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

// POST /treasury/cash/flows/:id/void - Void cash flow entry
router.post('/cash/flows/:id/void', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason) throw new AppError('Motivo de anulación requerido', 400);
    const data = await treasuryService.voidCashFlow(req.params.id, reason, req.user.id, req.ip);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ─── Treasury Operations ───

// GET /treasury - List operations
router.get('/', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const result = await treasuryService.listOperations(req.query);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

// GET /treasury/:id - Detail (must be after all named routes)
router.get('/:id', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const data = await treasuryService.getOperationById(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// POST /treasury - Create (single step: all data at once)
router.post('/', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const data = await treasuryService.createOperation(req.body, req.user.id, req.ip);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

// POST /treasury/:id/void
router.post('/:id/void', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason) throw new AppError('Motivo de anulación requerido', 400);
    const data = await treasuryService.voidOperation(req.params.id, reason, req.user.id, req.ip);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

module.exports = router;
