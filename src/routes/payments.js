const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const paymentService = require('../services/paymentService');
const { paginate } = require('../utils/helpers');

// GET /payments
router.get('/', authenticate, async (req, res, next) => {
  try {
    const result = await paymentService.listPayments(req.query);
    res.json({ success: true, ...paginate(result.data, result.total, result.page, result.limit) });
  } catch (err) { next(err); }
});

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

// GET /payments/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const payment = await paymentService.getPaymentById(req.params.id);
    res.json({ success: true, data: payment });
  } catch (err) { next(err); }
});

// GET /payments/:id/receipt (PDF)
router.get('/:id/receipt', authenticate, async (req, res, next) => {
  try {
    const PDFDocument = require('pdfkit');
    const payment = await paymentService.getPaymentById(req.params.id);

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

// POST /payments
router.post('/', authenticate, authorize('admin', 'contador', 'tesorero'), async (req, res, next) => {
  try {
    const payment = await paymentService.createPayment(req.body, req.user.id, req.ip);
    res.status(201).json({ success: true, data: payment });
  } catch (err) { next(err); }
});

// POST /payments/:id/void
router.post('/:id/void', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const result = await paymentService.voidPayment(req.params.id, req.body.reason, req.user.id, req.ip);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

module.exports = router;
