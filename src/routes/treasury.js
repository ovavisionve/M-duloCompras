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

// GET /treasury - List operations
router.get('/', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const result = await treasuryService.listOperations(req.query);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

// GET /treasury/:id - Detail
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
