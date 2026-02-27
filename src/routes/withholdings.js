const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const withholdingService = require('../services/withholdingService');
const { paginate } = require('../utils/helpers');

// GET /withholdings
router.get('/', authenticate, async (req, res, next) => {
  try {
    const result = await withholdingService.listWithholdings(req.query);
    res.json({ success: true, ...paginate(result.data, result.total, result.page, result.limit) });
  } catch (err) { next(err); }
});

// GET /withholdings/export
router.get('/export', authenticate, async (req, res, next) => {
  try {
    const { period, type } = req.query;
    const result = await withholdingService.listWithholdings({ fiscal_period: period, type, status: 'activa', limit: 1000 });

    // Generate SENIAT-compatible TXT
    const lines = result.data.map((w) => {
      return [
        w.supplier_rif,
        w.fiscal_period.replace('/', ''),
        w.withholding_date,
        w.voucher_number,
        w.base_amount,
        w.rate,
        w.amount_ves,
      ].join('\t');
    });

    const header = 'RIF\tPeriodo\tFecha\tComprobante\tBase\tPorcentaje\tMonto';
    const content = [header, ...lines].join('\n');

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename=retenciones_${type}_${period.replace('/', '-')}.txt`);
    res.send(content);
  } catch (err) { next(err); }
});

// GET /withholdings/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const withholding = await withholdingService.getWithholdingById(req.params.id);
    res.json({ success: true, data: withholding });
  } catch (err) { next(err); }
});

// GET /withholdings/:id/pdf
router.get('/:id/pdf', authenticate, async (req, res, next) => {
  try {
    const PDFDocument = require('pdfkit');
    const withholding = await withholdingService.getWithholdingById(req.params.id);
    const db = require('../database/connection');
    const companyRif = (await db('config').where({ key: 'company_rif' }).first())?.value || '';
    const companyName = (await db('config').where({ key: 'company_name' }).first())?.value || '';

    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=retencion_${withholding.voucher_number}.pdf`);
    doc.pipe(res);

    doc.fontSize(16).text('COMPROBANTE DE RETENCIÓN', { align: 'center' });
    doc.fontSize(10).text(`Tipo: ${withholding.type}`, { align: 'center' });
    doc.moveDown();
    doc.text(`Nº Comprobante: ${withholding.voucher_number}`);
    doc.text(`Fecha: ${withholding.withholding_date}`);
    doc.text(`Período Fiscal: ${withholding.fiscal_period}`);
    doc.moveDown();
    doc.text(`Agente de Retención: ${companyName} - ${companyRif}`);
    doc.text(`Sujeto Retenido: ${withholding.supplier_name} - ${withholding.supplier_rif}`);
    doc.moveDown();
    doc.text(`Base Imponible: ${withholding.base_amount}`);
    doc.text(`Porcentaje: ${withholding.rate}%`);
    doc.text(`Monto Retenido (VES): ${withholding.amount_ves}`);
    doc.text(`Monto Retenido (USD): ${withholding.amount_usd}`);
    doc.text(`Tasa BCV: ${withholding.exchange_rate}`);
    doc.moveDown();

    if (withholding.invoices?.length) {
      doc.text('Facturas Asociadas:', { underline: true });
      for (const inv of withholding.invoices) {
        doc.text(`  - Factura ${inv.invoice_number} | Base: ${inv.base_amount} | Retenido: ${inv.withheld_amount}`);
      }
    }

    doc.end();
  } catch (err) { next(err); }
});

// POST /withholdings
router.post('/', authenticate, authorize('admin', 'contador'), async (req, res, next) => {
  try {
    const withholding = await withholdingService.createWithholding(req.body, req.user.id, req.ip);
    res.status(201).json({ success: true, data: withholding });
  } catch (err) { next(err); }
});

// POST /withholdings/:id/void
router.post('/:id/void', authenticate, authorize('admin', 'contador'), async (req, res, next) => {
  try {
    const result = await withholdingService.voidWithholding(req.params.id, req.body.reason, req.user.id, req.ip);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

module.exports = router;
