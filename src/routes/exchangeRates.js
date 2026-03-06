const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const exchangeRateService = require('../services/exchangeRateService');
const auditService = require('../services/auditService');

/**
 * @swagger
 * /exchange-rates/today:
 *   get:
 *     summary: Obtener tasa de cambio del día
 *     description: Retorna la tasa de cambio vigente para la fecha actual
 *     tags: [Tasas de Cambio]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tasa de cambio del día
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/ExchangeRate'
 *       404:
 *         description: No hay tasa disponible para hoy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/today', authenticate, async (req, res, next) => {
  try {
    const rate = await exchangeRateService.getTodayRate();
    if (!rate) return res.status(404).json({ success: false, error: { message: 'No hay tasa disponible para hoy' } });
    res.json({ success: true, data: rate });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /exchange-rates:
 *   get:
 *     summary: Consultar tasas de cambio
 *     description: Obtiene tasas por fecha específica, rango de fechas, o las últimas 30 tasas si no se envían parámetros
 *     tags: [Tasas de Cambio]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: Fecha específica (YYYY-MM-DD)
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *         description: Fecha inicio del rango (YYYY-MM-DD)
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *         description: Fecha fin del rango (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Tasa(s) de cambio encontrada(s)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   oneOf:
 *                     - $ref: '#/components/schemas/ExchangeRate'
 *                     - type: array
 *                       items:
 *                         $ref: '#/components/schemas/ExchangeRate'
 */
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

/**
 * @swagger
 * /exchange-rates/range:
 *   get:
 *     summary: Obtener tasas por rango de fechas
 *     description: Retorna las tasas de cambio dentro de un rango de fechas específico
 *     tags: [Tasas de Cambio]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Fecha inicio (YYYY-MM-DD)
 *       - in: query
 *         name: to
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Fecha fin (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Lista de tasas en el rango
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ExchangeRate'
 *       400:
 *         description: Parámetros from y to requeridos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/range', authenticate, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ success: false, error: { message: 'Parámetros from y to requeridos' } });
    const rates = await exchangeRateService.getRateRange(from, to);
    res.json({ success: true, data: rates });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /exchange-rates/manual:
 *   post:
 *     summary: Registrar tasa de cambio manual
 *     description: Permite registrar manualmente una tasa de cambio para una fecha específica
 *     tags: [Tasas de Cambio]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - date
 *               - rate
 *             properties:
 *               date:
 *                 type: string
 *                 format: date
 *                 description: Fecha de la tasa (YYYY-MM-DD)
 *               rate:
 *                 type: number
 *                 description: Valor de la tasa en Bs/$
 *     responses:
 *       201:
 *         description: Tasa registrada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/ExchangeRate'
 *       400:
 *         description: Fecha y tasa requeridas
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
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

/**
 * @swagger
 * /exchange-rates/fetch:
 *   post:
 *     summary: Obtener tasa BCV
 *     description: Consulta y almacena la tasa de cambio oficial del BCV. Solo administradores.
 *     tags: [Tasas de Cambio]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tasa BCV obtenida y almacenada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/ExchangeRate'
 *                 message:
 *                   type: string
 *       502:
 *         description: No se pudo obtener la tasa del BCV
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
/**
 * @swagger
 * /exchange-rates/binance:
 *   get:
 *     summary: Obtener tasa Binance P2P USDT/VES
 *     description: Retorna la tasa actual del dólar Binance P2P (USDT/VES)
 *     tags: [Tasas de Cambio]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tasa Binance P2P del momento
 *       502:
 *         description: No se pudo obtener la tasa Binance
 */
router.get('/binance', authenticate, async (req, res, next) => {
  try {
    const result = await exchangeRateService.getTodayBinanceRate();
    if (!result) return res.status(502).json({ success: false, error: { message: 'No se pudo obtener la tasa Binance P2P' } });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(502).json({ success: false, error: { message: err.message || 'No se pudo obtener la tasa Binance P2P' } });
  }
});

router.post('/fetch', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const result = await exchangeRateService.fetchAndStoreBcvRate();
    res.json({ success: true, data: result, message: `Tasa BCV obtenida: ${result.rate} Bs/$` });
  } catch (err) {
    res.status(502).json({ success: false, error: { message: err.message || 'No se pudo obtener la tasa BCV' } });
  }
});

module.exports = router;
