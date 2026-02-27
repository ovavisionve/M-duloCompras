const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const purchaseBookService = require('../services/purchaseBookService');

// GET /purchase-book?period=MM/YYYY
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { period } = req.query;
    if (!period) return res.status(400).json({ success: false, error: { message: 'Período requerido (MM/YYYY)' } });
    const book = await purchaseBookService.getPurchaseBook(period);
    res.json({ success: true, data: book });
  } catch (err) { next(err); }
});

// GET /purchase-book/validate?period=MM/YYYY
router.get('/validate', authenticate, async (req, res, next) => {
  try {
    const result = await purchaseBookService.validateBook(req.query.period);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// GET /purchase-book/pdf?period=MM/YYYY
router.get('/pdf', authenticate, async (req, res, next) => {
  try {
    const PDFDocument = require('pdfkit');
    const book = await purchaseBookService.getPurchaseBook(req.query.period);
    const db = require('../database/connection');
    const companyName = (await db('config').where({ key: 'company_name' }).first())?.value || '';
    const companyRif = (await db('config').where({ key: 'company_rif' }).first())?.value || '';

    const doc = new PDFDocument({ size: 'LEGAL', layout: 'landscape', margin: 30 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=libro_compras_${req.query.period.replace('/', '-')}.pdf`);
    doc.pipe(res);

    doc.fontSize(14).text('LIBRO DE COMPRAS', { align: 'center' });
    doc.fontSize(10).text(`${companyName} - ${companyRif}`, { align: 'center' });
    doc.text(`Período: ${req.query.period}`, { align: 'center' });
    doc.moveDown();

    // Table header
    const headers = ['Nº', 'Fecha', 'RIF', 'Proveedor', 'Nº Factura', 'Nº Control', 'Tipo', 'Base Imp.', 'Exento', 'IVA', 'IVA Ret.'];
    const colWidths = [30, 65, 85, 150, 65, 65, 35, 70, 60, 60, 55];
    let x = 30;
    doc.fontSize(7).font('Helvetica-Bold');
    headers.forEach((h, i) => { doc.text(h, x, doc.y, { width: colWidths[i] }); x += colWidths[i]; });
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(6);

    for (const entry of book.entries) {
      x = 30;
      const y = doc.y;
      if (y > 550) { doc.addPage(); }
      const row = [
        entry.operation_number,
        entry.emission_date,
        entry.supplier_rif,
        (entry.supplier_name || '').substring(0, 30),
        entry.invoice_number,
        entry.control_number || '',
        entry.document_type,
        entry.taxable_purchases?.toFixed(2),
        entry.exempt_purchases?.toFixed(2),
        entry.vat_amount?.toFixed(2),
        entry.iva_withheld?.toFixed(2),
      ];
      row.forEach((val, i) => { doc.text(String(val || ''), x, doc.y, { width: colWidths[i] }); x += colWidths[i]; });
      doc.moveDown(0.3);
    }

    doc.moveDown();
    doc.font('Helvetica-Bold').fontSize(8);
    doc.text(`TOTALES: Base Imponible: ${book.totals.total_taxable.toFixed(2)} | Exento: ${book.totals.total_exempt.toFixed(2)} | IVA: ${book.totals.total_vat.toFixed(2)} | IVA Retenido: ${book.totals.total_iva_withheld.toFixed(2)} | TOTAL: ${book.totals.grand_total.toFixed(2)}`);

    doc.end();
  } catch (err) { next(err); }
});

// GET /purchase-book/excel?period=MM/YYYY
router.get('/excel', authenticate, async (req, res, next) => {
  try {
    const ExcelJS = require('exceljs');
    const book = await purchaseBookService.getPurchaseBook(req.query.period);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Libro de Compras');

    sheet.columns = [
      { header: 'Nº', key: 'num', width: 6 },
      { header: 'Fecha', key: 'date', width: 12 },
      { header: 'RIF Proveedor', key: 'rif', width: 15 },
      { header: 'Razón Social', key: 'name', width: 30 },
      { header: 'Nº Factura', key: 'invoice', width: 12 },
      { header: 'Nº Control', key: 'control', width: 14 },
      { header: 'Tipo', key: 'type', width: 6 },
      { header: 'Base Imponible', key: 'taxable', width: 15 },
      { header: 'Exento', key: 'exempt', width: 12 },
      { header: 'IVA', key: 'vat', width: 12 },
      { header: 'IVA Retenido', key: 'iva_withheld', width: 14 },
      { header: 'Nº Comprobante Ret.', key: 'voucher', width: 18 },
    ];

    for (const entry of book.entries) {
      sheet.addRow({
        num: entry.operation_number,
        date: entry.emission_date,
        rif: entry.supplier_rif,
        name: entry.supplier_name,
        invoice: entry.invoice_number,
        control: entry.control_number,
        type: entry.document_type,
        taxable: entry.taxable_purchases,
        exempt: entry.exempt_purchases,
        vat: entry.vat_amount,
        iva_withheld: entry.iva_withheld,
        voucher: entry.withholding_voucher || '',
      });
    }

    // Totals row
    sheet.addRow({});
    sheet.addRow({
      name: 'TOTALES',
      taxable: book.totals.total_taxable,
      exempt: book.totals.total_exempt,
      vat: book.totals.total_vat,
      iva_withheld: book.totals.total_iva_withheld,
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=libro_compras_${req.query.period.replace('/', '-')}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

// GET /purchase-book/seniat?period=MM/YYYY (TXT format)
router.get('/seniat', authenticate, async (req, res, next) => {
  try {
    const book = await purchaseBookService.getPurchaseBook(req.query.period);
    const db = require('../database/connection');
    const companyRif = (await db('config').where({ key: 'company_rif' }).first())?.value || '';

    const lines = book.entries.map((e) => {
      return [
        companyRif,
        e.emission_date,
        e.supplier_rif,
        e.supplier_name,
        e.document_type === 'FC' || e.document_type === 'FG' ? '01' : e.document_type === 'ND' ? '02' : '03',
        e.invoice_number,
        e.control_number || '',
        e.taxable_purchases.toFixed(2),
        e.exempt_purchases.toFixed(2),
        e.vat_amount.toFixed(2),
        e.iva_withheld.toFixed(2),
        e.withholding_voucher || '',
      ].join('\t');
    });

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename=libro_compras_seniat_${req.query.period.replace('/', '-')}.txt`);
    res.send(lines.join('\n'));
  } catch (err) { next(err); }
});

// POST /purchase-book/close?period=MM/YYYY
router.post('/close', authenticate, authorize('admin', 'contador'), async (req, res, next) => {
  try {
    const result = await purchaseBookService.closePeriod(req.query.period, req.user.id, req.ip);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

module.exports = router;
