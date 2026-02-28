const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const exchangeRateService = require('../services/exchangeRateService');
const auditService = require('../services/auditService');

// GET /exchange-rates/today
router.get('/today', authenticate, async (req, res, next) => {
  try {
    const rate = await exchangeRateService.getTodayRate();
    if (!rate) return res.status(404).json({ success: false, error: { message: 'No hay tasa disponible para hoy' } });
    res.json({ success: true, data: rate });
  } catch (err) { next(err); }
});

// GET /exchange-rates?date=YYYY-MM-DD
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { date, from, to } = req.query;
    if (from && to) {
      const rates = await exchangeRateService.getRateRange(from, to);
      return res.json({ success: true, data: rates });
    }
    if (date) {
      const rate = await exchangeRateService.getRateForDate(date);
      return res.json({ success: true, data: rate });
    }
    // Return last 30 rates
    const db = require('../database/connection');
    const rates = await db('exchange_rates').orderBy('rate_date', 'desc').limit(30);
    res.json({ success: true, data: rates });
  } catch (err) { next(err); }
});

// GET /exchange-rates/range?from=&to=
router.get('/range', authenticate, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ success: false, error: { message: 'Parámetros from y to requeridos' } });
    const rates = await exchangeRateService.getRateRange(from, to);
    res.json({ success: true, data: rates });
  } catch (err) { next(err); }
});

// POST /exchange-rates/manual
router.post('/manual', authenticate, authorize('admin', 'contador'), async (req, res, next) => {
  try {
    const { date, rate } = req.body;
    if (!date || !rate) return res.status(400).json({ success: false, error: { message: 'Fecha y tasa requeridas' } });

    const result = await exchangeRateService.storeManualRate(date, parseFloat(rate), req.user.id);
    await auditService.logAction(req.user.id, 'exchange_rate', result.id, 'create', null, { date, rate, source: 'manual' }, req.ip);

    const webhookService = require('../services/webhookService');
    webhookService.emit('exchange_rate.updated', { date, rate: parseFloat(rate), source: 'manual' });

    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

// POST /exchange-rates/fetch (manual trigger)
router.post('/fetch', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const result = await exchangeRateService.fetchAndStoreBcvRate();
    res.json({ success: true, data: result, message: `Tasa BCV obtenida: ${result.rate} Bs/$` });
  } catch (err) {
    res.status(502).json({ success: false, error: { message: err.message || 'No se pudo obtener la tasa BCV' } });
  }
});

module.exports = router;
