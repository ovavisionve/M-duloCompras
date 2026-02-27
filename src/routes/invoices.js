const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const invoiceService = require('../services/invoiceService');
const { paginate } = require('../utils/helpers');

// GET /invoices
router.get('/', authenticate, async (req, res, next) => {
  try {
    const result = await invoiceService.listInvoices(req.query);
    res.json({ success: true, ...paginate(result.data, result.total, result.page, result.limit) });
  } catch (err) { next(err); }
});

// GET /invoices/summary
router.get('/summary', authenticate, async (req, res, next) => {
  try {
    const { period } = req.query;
    const db = require('../database/connection');
    const summary = await db('invoices')
      .where({ fiscal_period: period })
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

// GET /invoices/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const invoice = await invoiceService.getInvoiceById(req.params.id);
    res.json({ success: true, data: invoice });
  } catch (err) { next(err); }
});

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

// POST /invoices
router.post('/', authenticate, authorize('admin', 'contador', 'operador'), async (req, res, next) => {
  try {
    const invoice = await invoiceService.createInvoice(req.body, req.user.id, req.ip);
    res.status(201).json({ success: true, data: invoice });
  } catch (err) { next(err); }
});

// POST /invoices/bulk
router.post('/bulk', authenticate, authorize('admin', 'contador'), async (req, res, next) => {
  try {
    const results = [];
    const errors = [];
    for (let i = 0; i < req.body.invoices.length; i++) {
      try {
        const invoice = await invoiceService.createInvoice(req.body.invoices[i], req.user.id, req.ip);
        results.push({ index: i, success: true, id: invoice.id });
      } catch (err) {
        errors.push({ index: i, success: false, error: err.message });
      }
    }
    res.status(201).json({ success: true, data: { created: results.length, errors: errors.length, results, errors } });
  } catch (err) { next(err); }
});

// PUT /invoices/:id
router.put('/:id', authenticate, authorize('admin', 'contador', 'operador'), async (req, res, next) => {
  try {
    const invoice = await invoiceService.updateInvoice(req.params.id, req.body, req.user.id, req.ip);
    res.json({ success: true, data: invoice });
  } catch (err) { next(err); }
});

// PATCH /invoices/:id/status
router.patch('/:id/status', authenticate, authorize('admin', 'contador'), async (req, res, next) => {
  try {
    const { status } = req.body;
    const invoice = await invoiceService.changeStatus(req.params.id, status, req.user.id, req.ip);
    res.json({ success: true, data: invoice });
  } catch (err) { next(err); }
});

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
