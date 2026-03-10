const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const paymentService = require('../services/paymentService');
const { paginate } = require('../utils/helpers');

/**
 * @swagger
 * /payments:
 *   get:
 *     summary: Listar pagos
 *     tags: [Pagos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Número de página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Cantidad de resultados por página
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [activo, anulado]
 *         description: Filtrar por estado
 *       - in: query
 *         name: payment_method
 *         schema:
 *           type: string
 *         description: Filtrar por método de pago
 *       - in: query
 *         name: currency
 *         schema:
 *           type: string
 *           enum: [VES, USD]
 *         description: Filtrar por moneda
 *     responses:
 *       200:
 *         description: Lista de pagos paginada
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
 *                     $ref: '#/components/schemas/Payment'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       401:
 *         description: No autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// GET /payments
router.get('/', authenticate, async (req, res, next) => {
  try {
    const result = await paymentService.listPayments(req.query, req.user.organizationId);
    res.json({ success: true, ...paginate(result.data, result.total, result.page, result.limit) });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /payments/summary:
 *   get:
 *     summary: Resumen de pagos por período
 *     tags: [Pagos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         required: true
 *         schema:
 *           type: string
 *         description: Período en formato MM-YYYY
 *     responses:
 *       200:
 *         description: Resumen de pagos del período
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     period:
 *                       type: string
 *                     total_payments:
 *                       type: integer
 *                     total_ves:
 *                       type: number
 *                     total_usd:
 *                       type: number
 *                     total_exchange_diff:
 *                       type: number
 *       401:
 *         description: No autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// GET /payments/summary
router.get('/summary', authenticate, async (req, res, next) => {
  try {
    const { period } = req.query;
    const [month, year] = period.split('-');
    const db = require('../database/connection');
    const startDate = `${year}-${month}-01`;
    const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];

    const summary = await db('payments')
      .where('status', 'activo')
      .where('organization_id', req.user.organizationId)
      .whereBetween('payment_date', [startDate, endDate])
      .select(
        db.raw('COUNT(*) as total_payments'),
        db.raw("SUM(CASE WHEN currency = 'VES' THEN amount ELSE amount_other_currency END) as total_ves"),
        db.raw("SUM(CASE WHEN currency = 'USD' THEN amount ELSE amount_other_currency END) as total_usd"),
        db.raw('SUM(exchange_difference) as total_exchange_diff')
      )
      .first();

    res.json({ success: true, data: { period, ...summary } });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /payments/{id}:
 *   get:
 *     summary: Obtener pago por ID
 *     tags: [Pagos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID del pago
 *     responses:
 *       200:
 *         description: Detalle del pago
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Payment'
 *       404:
 *         description: Pago no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// GET /payments/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const payment = await paymentService.getPaymentById(req.params.id, req.user.organizationId);
    res.json({ success: true, data: payment });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /payments/{id}/receipt:
 *   get:
 *     summary: Descargar recibo de pago en PDF
 *     tags: [Pagos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID del pago
 *     responses:
 *       200:
 *         description: Archivo PDF del recibo de pago
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Pago no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// GET /payments/:id/receipt (PDF)
router.get('/:id/receipt', authenticate, async (req, res, next) => {
  try {
    const PDFDocument = require('pdfkit');
    const payment = await paymentService.getPaymentById(req.params.id, req.user.organizationId);

    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=recibo_pago_${payment.id.substring(0, 8)}.pdf`);
    doc.pipe(res);

    doc.fontSize(16).text('RECIBO DE PAGO', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10);
    doc.text(`Fecha: ${payment.payment_date}`);
    doc.text(`Método: ${payment.payment_method}`);
    doc.text(`Referencia: ${payment.reference_number || 'N/A'}`);
    doc.text(`Moneda: ${payment.currency}`);
    doc.text(`Monto: ${payment.amount}`);
    doc.text(`Tasa BCV: ${payment.exchange_rate}`);
    doc.text(`Equivalente: ${payment.amount_other_currency} ${payment.currency === 'VES' ? 'USD' : 'VES'}`);
    if (parseFloat(payment.exchange_difference) !== 0) {
      doc.text(`Diferencial Cambiario: ${payment.exchange_difference}`);
    }
    doc.moveDown();

    if (payment.invoices?.length) {
      doc.text('Facturas Pagadas:', { underline: true });
      for (const inv of payment.invoices) {
        doc.text(`  - ${inv.supplier_name} | Factura ${inv.invoice_number} | Aplicado: ${inv.amount_applied}`);
      }
    }

    if (payment.observations) {
      doc.moveDown();
      doc.text(`Observaciones: ${payment.observations}`);
    }

    doc.end();
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /payments:
 *   post:
 *     summary: Registrar un nuevo pago
 *     tags: [Pagos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PaymentInput'
 *     responses:
 *       201:
 *         description: Pago creado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Payment'
 *       400:
 *         description: Datos inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: No autorizado (requiere rol admin, contador o tesorero)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// POST /payments
router.post('/', authenticate, authorize('admin', 'contador', 'tesorero'), async (req, res, next) => {
  try {
    const payment = await paymentService.createPayment(req.body, req.user.id, req.ip, req.user.organizationId);
    res.status(201).json({ success: true, data: payment });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /payments/{id}/void:
 *   post:
 *     summary: Anular un pago
 *     tags: [Pagos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID del pago a anular
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Motivo de la anulación
 *     responses:
 *       200:
 *         description: Pago anulado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Payment'
 *       403:
 *         description: No autorizado (requiere rol admin o tesorero)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Pago no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// POST /payments/:id/void
router.post('/:id/void', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const result = await paymentService.voidPayment(req.params.id, req.body.reason, req.user.id, req.ip, req.user.organizationId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

module.exports = router;
