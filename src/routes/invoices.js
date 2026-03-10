const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const invoiceService = require('../services/invoiceService');
const { paginate } = require('../utils/helpers');

/**
 * @swagger
 * /invoices:
 *   get:
 *     summary: Listar y filtrar facturas
 *     tags: [Facturas]
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
 *         name: supplier_id
 *         schema:
 *           type: string
 *         description: Filtrar por proveedor
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [registrada, pago_parcial, pagada, anulada]
 *         description: Filtrar por estado
 *       - in: query
 *         name: fiscal_period
 *         schema:
 *           type: string
 *         description: Filtrar por período fiscal (MM/YYYY)
 *       - in: query
 *         name: currency
 *         schema:
 *           type: string
 *           enum: [VES, USD]
 *         description: Filtrar por moneda
 *     responses:
 *       200:
 *         description: Lista de facturas paginada
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
 *                     $ref: '#/components/schemas/Invoice'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       401:
 *         description: No autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// GET /invoices
router.get('/', authenticate, async (req, res, next) => {
  try {
    const result = await invoiceService.listInvoices(req.query, req.user.organizationId);
    res.json({ success: true, ...paginate(result.data, result.total, result.page, result.limit) });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /invoices/summary:
 *   get:
 *     summary: Resumen de facturas por período fiscal
 *     tags: [Facturas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         required: true
 *         schema:
 *           type: string
 *         description: Período fiscal (MM/YYYY)
 *     responses:
 *       200:
 *         description: Resumen del período fiscal
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
 *                     total_invoices:
 *                       type: integer
 *                     total_ves:
 *                       type: number
 *                     total_usd:
 *                       type: number
 *                     total_vat:
 *                       type: number
 *                     total_taxable:
 *                       type: number
 *                     total_exempt:
 *                       type: number
 *       401:
 *         description: No autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// GET /invoices/summary
router.get('/summary', authenticate, async (req, res, next) => {
  try {
    const { period } = req.query;
    const db = require('../database/connection');
    const summary = await db('invoices')
      .where({ fiscal_period: period, organization_id: req.user.organizationId })
      .whereIn('status', ['registrada', 'pago_parcial', 'pagada'])
      .select(
        db.raw('COUNT(*) as total_invoices'),
        db.raw('SUM(total_ves) as total_ves'),
        db.raw('SUM(total_usd) as total_usd'),
        db.raw('SUM(vat_amount) as total_vat'),
        db.raw('SUM(taxable_amount) as total_taxable'),
        db.raw('SUM(exempt_amount) as total_exempt')
      )
      .first();
    res.json({ success: true, data: { period, ...summary } });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /invoices/{id}:
 *   get:
 *     summary: Obtener factura por ID
 *     tags: [Facturas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID de la factura
 *     responses:
 *       200:
 *         description: Detalle de la factura
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Invoice'
 *       404:
 *         description: Factura no encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// GET /invoices/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const invoice = await invoiceService.getInvoiceById(req.params.id, req.user.organizationId);
    res.json({ success: true, data: invoice });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /invoices/{id}/payments:
 *   get:
 *     summary: Listar pagos asociados a una factura
 *     tags: [Facturas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID de la factura
 *     responses:
 *       200:
 *         description: Lista de pagos aplicados a la factura
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
 *       401:
 *         description: No autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// GET /invoices/:id/payments
router.get('/:id/payments', authenticate, async (req, res, next) => {
  try {
    const db = require('../database/connection');
    const payments = await db('payment_invoices')
      .join('payments', 'payment_invoices.payment_id', 'payments.id')
      .where('payment_invoices.invoice_id', req.params.id)
      .select('payments.*', 'payment_invoices.amount_applied');
    res.json({ success: true, data: payments });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /invoices/{id}/balance:
 *   get:
 *     summary: Obtener saldo pendiente de una factura
 *     tags: [Facturas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID de la factura
 *     responses:
 *       200:
 *         description: Saldo de la factura con desglose de pagos y retenciones
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
 *                     total_amount:
 *                       type: number
 *                     total_paid:
 *                       type: number
 *                     total_withheld:
 *                       type: number
 *                     remaining:
 *                       type: number
 *                     currency:
 *                       type: string
 *                     is_fully_paid:
 *                       type: boolean
 *       404:
 *         description: Factura no encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// GET /invoices/:id/balance
router.get('/:id/balance', authenticate, async (req, res, next) => {
  try {
    const db = require('../database/connection');
    const invoice = await db('invoices').where({ id: req.params.id }).first();
    if (!invoice) return res.status(404).json({ success: false, error: { message: 'Factura no encontrada' } });

    const [paymentsResult] = await db('payment_invoices')
      .join('payments', 'payment_invoices.payment_id', 'payments.id')
      .where({ 'payment_invoices.invoice_id': req.params.id, 'payments.status': 'activo' })
      .sum('payment_invoices.amount_applied as total');
    const [withholdingsResult] = await db('withholding_invoices')
      .join('withholdings', 'withholding_invoices.withholding_id', 'withholdings.id')
      .where({ 'withholding_invoices.invoice_id': req.params.id, 'withholdings.status': 'activa' })
      .sum('withholding_invoices.withheld_amount as total');

    const [ncResult] = await db('credit_note_applications')
      .where('credit_note_applications.invoice_id', req.params.id)
      .sum('credit_note_applications.amount_applied as total');

    const totalPaid = parseFloat(paymentsResult?.total) || 0;
    const totalWithheld = parseFloat(withholdingsResult?.total) || 0;
    const totalNC = parseFloat(ncResult?.total) || 0;
    const totalAmount = parseFloat(invoice.total_amount);
    const remaining = Math.max(0, Math.round((totalAmount - totalPaid - totalWithheld - totalNC) * 100) / 100);

    res.json({
      success: true,
      data: {
        total_amount: totalAmount,
        total_paid: totalPaid,
        total_withheld: totalWithheld,
        total_credit_notes: totalNC,
        remaining,
        currency: invoice.currency,
        is_fully_paid: remaining <= 0.01,
      },
    });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /invoices/{id}/withholdings:
 *   get:
 *     summary: Listar retenciones asociadas a una factura
 *     tags: [Facturas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID de la factura
 *     responses:
 *       200:
 *         description: Lista de retenciones aplicadas a la factura
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
 *                     $ref: '#/components/schemas/Withholding'
 *       401:
 *         description: No autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// GET /invoices/:id/withholdings
router.get('/:id/withholdings', authenticate, async (req, res, next) => {
  try {
    const db = require('../database/connection');
    const withholdings = await db('withholding_invoices')
      .join('withholdings', 'withholding_invoices.withholding_id', 'withholdings.id')
      .where('withholding_invoices.invoice_id', req.params.id)
      .select('withholdings.*', 'withholding_invoices.withheld_amount');
    res.json({ success: true, data: withholdings });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /invoices:
 *   post:
 *     summary: Crear una nueva factura
 *     tags: [Facturas]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/InvoiceInput'
 *     responses:
 *       201:
 *         description: Factura creada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Invoice'
 *       400:
 *         description: Datos inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: No autorizado (requiere rol admin, contador u operador)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// POST /invoices
router.post('/', authenticate, authorize('admin', 'contador', 'operador'), async (req, res, next) => {
  try {
    const invoice = await invoiceService.createInvoice(req.body, req.user.id, req.ip, req.user.organizationId);
    res.status(201).json({ success: true, data: invoice });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /invoices/bulk:
 *   post:
 *     summary: Crear facturas en lote
 *     description: Permite crear múltiples facturas en una sola solicitud. Requiere rol admin o contador.
 *     tags: [Facturas]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - invoices
 *             properties:
 *               invoices:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/InvoiceInput'
 *     responses:
 *       201:
 *         description: Resultado de la creación en lote
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
 *                     created:
 *                       type: integer
 *                     errors:
 *                       type: integer
 *                     results:
 *                       type: array
 *                       items:
 *                         type: object
 *       403:
 *         description: No autorizado (requiere rol admin o contador)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// POST /invoices/bulk
router.post('/bulk', authenticate, authorize('admin', 'contador'), async (req, res, next) => {
  try {
    const results = [];
    const errors = [];
    for (let i = 0; i < req.body.invoices.length; i++) {
      try {
        const invoice = await invoiceService.createInvoice(req.body.invoices[i], req.user.id, req.ip, req.user.organizationId);
        results.push({ index: i, success: true, id: invoice.id });
      } catch (err) {
        errors.push({ index: i, success: false, error: err.message });
      }
    }
    res.status(201).json({ success: true, data: { created: results.length, errors: errors.length, results, errors } });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /invoices/{id}:
 *   put:
 *     summary: Actualizar una factura
 *     tags: [Facturas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID de la factura
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/InvoiceInput'
 *     responses:
 *       200:
 *         description: Factura actualizada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Invoice'
 *       404:
 *         description: Factura no encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: No autorizado (requiere rol admin, contador u operador)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// PUT /invoices/:id
router.put('/:id', authenticate, authorize('admin', 'contador', 'operador'), async (req, res, next) => {
  try {
    const invoice = await invoiceService.updateInvoice(req.params.id, req.body, req.user.id, req.ip, req.user.organizationId);
    res.json({ success: true, data: invoice });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /invoices/{id}/status:
 *   patch:
 *     summary: Cambiar estado de una factura
 *     tags: [Facturas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID de la factura
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [registrada, pago_parcial, pagada, anulada]
 *                 description: Nuevo estado de la factura
 *     responses:
 *       200:
 *         description: Estado actualizado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Invoice'
 *       403:
 *         description: No autorizado (requiere rol admin o contador)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Factura no encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// PATCH /invoices/:id/status
router.patch('/:id/status', authenticate, authorize('admin', 'contador'), async (req, res, next) => {
  try {
    const { status } = req.body;
    const invoice = await invoiceService.changeStatus(req.params.id, status, req.user.id, req.ip, req.user.organizationId);
    res.json({ success: true, data: invoice });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /invoices/{id}/attachments:
 *   post:
 *     summary: Adjuntar archivo a una factura
 *     tags: [Facturas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID de la factura
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Archivo a adjuntar (PDF, imagen, etc.)
 *     responses:
 *       200:
 *         description: Archivo adjuntado exitosamente
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
 *                     path:
 *                       type: string
 *                     filename:
 *                       type: string
 *       400:
 *         description: Archivo requerido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// POST /invoices/:id/attachments
router.post('/:id/attachments', authenticate, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: { message: 'Archivo requerido' } });
    const db = require('../database/connection');
    await db('invoices').where({ id: req.params.id }).update({ attachment_path: req.file.path });
    res.json({ success: true, data: { path: req.file.path, filename: req.file.filename } });
  } catch (err) { next(err); }
});

module.exports = router;
