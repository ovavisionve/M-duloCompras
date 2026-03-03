const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const treasuryService = require('../services/treasuryService');

// ─── Only admin and tesorero can access treasury operations ───

// GET /treasury/accounts - Internal accounts list
router.get('/accounts', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const data = await treasuryService.getAccounts();
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

// GET /treasury/summary?period=MM/YYYY - Monthly summary
router.get('/summary', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const { period } = req.query;
    if (!period) throw new AppError('Período requerido (MM/YYYY)', 400);
    const data = await treasuryService.getMonthlySummary(period);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// GET /treasury/:id - Operation detail with ledger
router.get('/:id', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const data = await treasuryService.getOperationById(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// POST /treasury - Create operation (Step 1: VES out)
router.post('/', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const data = await treasuryService.createOperation(req.body, req.user.id, req.ip);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

// PATCH /treasury/:id/receive-usd - Step 2: USD received
router.patch('/:id/receive-usd', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const data = await treasuryService.receiveUsd(req.params.id, req.body, req.user.id, req.ip);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// PATCH /treasury/:id/complete - Mark completed
router.patch('/:id/complete', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const data = await treasuryService.completeOperation(req.params.id, req.body, req.user.id, req.ip);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// POST /treasury/:id/void - Void operation
router.post('/:id/void', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason) throw new AppError('Motivo de anulación requerido', 400);
    const data = await treasuryService.voidOperation(req.params.id, reason, req.user.id, req.ip);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

module.exports = router;
