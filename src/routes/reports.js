const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const reportService = require('../services/reportService');
const auditService = require('../services/auditService');
const { round2 } = require('../utils/helpers');

// ═══════════════════════════════════════════════════════════════
// CUENTAS POR PAGAR (Accounts Payable)
// ═══════════════════════════════════════════════════════════════

// GET /reports/accounts-payable
router.get('/accounts-payable', authenticate, async (req, res, next) => {
  try {
    const result = await reportService.getAccountsPayable(req.query);
    res.json({ success: true, data: { invoices: result.invoices, summary: result.summary }, pagination: result.pagination });
  } catch (err) { next(err); }
});

// GET /reports/accounts-payable/pdf
router.get('/accounts-payable/pdf', authenticate, async (req, res, next) => {
  try {
    const PDFDocument = require('pdfkit');
    const db = require('../database/connection');
    const result = await reportService.getAccountsPayable(req.query);
    const companyName = (await db('config').where({ key: 'company_name' }).first())?.value || '';
    const companyRif = (await db('config').where({ key: 'company_rif' }).first())?.value || '';

    const doc = new PDFDocument({ size: 'LEGAL', layout: 'landscape', margin: 30 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=cuentas_por_pagar.pdf');
    doc.pipe(res);

    doc.fontSize(14).text('REPORTE DE CUENTAS POR PAGAR', { align: 'center' });
    doc.fontSize(10).text(`${companyName} - ${companyRif}`, { align: 'center' });
    doc.fontSize(9).text(`Generado: ${new Date().toLocaleDateString('es-VE')}`, { align: 'center' });
    if (req.query.fiscal_period) doc.text(`Período: ${req.query.fiscal_period}`, { align: 'center' });
    doc.moveDown();

    // Summary
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text(`Total Facturas: ${result.summary.total_invoices} | Total VES: ${result.summary.total_ves.toLocaleString('es-VE', { minimumFractionDigits: 2 })} | Total USD: ${result.summary.total_usd.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`);
    doc.moveDown(0.5);

    // Aging summary
    const buckets = result.summary.aging_buckets;
    doc.text(`Antigüedad: 0-30d: ${buckets['0-30 días'].total_ves.toLocaleString('es-VE')} Bs | 31-60d: ${buckets['31-60 días'].total_ves.toLocaleString('es-VE')} Bs | 61-90d: ${buckets['61-90 días'].total_ves.toLocaleString('es-VE')} Bs | 90+d: ${buckets['90+ días'].total_ves.toLocaleString('es-VE')} Bs`);
    doc.moveDown();

    // Table
    const headers = ['Nº Factura', 'RIF', 'Proveedor', 'Fecha', 'Moneda', 'Total VES', 'Total USD', 'Días', 'Antigüedad', 'Estado'];
    const colWidths = [70, 85, 160, 65, 45, 80, 70, 35, 70, 60];
    let x = 30;
    doc.fontSize(7).font('Helvetica-Bold');
    headers.forEach((h, i) => { doc.text(h, x, doc.y, { width: colWidths[i] }); x += colWidths[i]; });
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(6);

    for (const inv of result.all_invoices) {
      x = 30;
      if (doc.y > 550) { doc.addPage(); }
      const row = [
        inv.invoice_number,
        inv.supplier_rif,
        (inv.supplier_name || '').substring(0, 35),
        new Date(inv.emission_date).toLocaleDateString('es-VE'),
        inv.currency,
        parseFloat(inv.total_ves).toLocaleString('es-VE', { minimumFractionDigits: 2 }),
        parseFloat(inv.total_usd).toLocaleString('es-VE', { minimumFractionDigits: 2 }),
        inv.days_pending,
        inv.aging,
        inv.status,
      ];
      row.forEach((val, i) => { doc.text(String(val || ''), x, doc.y, { width: colWidths[i] }); x += colWidths[i]; });
      doc.moveDown(0.3);
    }

    doc.end();
  } catch (err) { next(err); }
});

// GET /reports/accounts-payable/excel
router.get('/accounts-payable/excel', authenticate, async (req, res, next) => {
  try {
    const ExcelJS = require('exceljs');
    const result = await reportService.getAccountsPayable(req.query);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Cuentas por Pagar');

    // Title row
    sheet.mergeCells('A1:J1');
    sheet.getCell('A1').value = 'REPORTE DE CUENTAS POR PAGAR';
    sheet.getCell('A1').font = { bold: true, size: 14 };
    sheet.getCell('A1').alignment = { horizontal: 'center' };

    sheet.mergeCells('A2:J2');
    sheet.getCell('A2').value = `Generado: ${new Date().toLocaleDateString('es-VE')}`;
    sheet.getCell('A2').alignment = { horizontal: 'center' };

    // Headers
    sheet.addRow([]);
    const headerRow = sheet.addRow([
      'Nº Factura', 'Nº Control', 'RIF Proveedor', 'Proveedor', 'Fecha Emisión',
      'Moneda', 'Total VES', 'Total USD', 'Días Pendientes', 'Antigüedad',
      'Categoría', 'Centro Costo', 'Estado'
    ]);
    headerRow.font = { bold: true };
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    });

    sheet.columns = [
      { key: 'invoice', width: 18 }, { key: 'control', width: 16 }, { key: 'rif', width: 16 },
      { key: 'name', width: 35 }, { key: 'date', width: 14 }, { key: 'currency', width: 8 },
      { key: 'ves', width: 18 }, { key: 'usd', width: 14 }, { key: 'days', width: 8 },
      { key: 'aging', width: 14 }, { key: 'category', width: 18 }, { key: 'cc', width: 18 },
      { key: 'status', width: 14 },
    ];

    for (const inv of result.all_invoices) {
      sheet.addRow([
        inv.invoice_number, inv.control_number, inv.supplier_rif, inv.supplier_name,
        new Date(inv.emission_date).toLocaleDateString('es-VE'),
        inv.currency, parseFloat(inv.total_ves), parseFloat(inv.total_usd),
        inv.days_pending, inv.aging, inv.category_name || '', inv.cost_center_name || '', inv.status,
      ]);
    }

    // Totals
    sheet.addRow([]);
    const totalsRow = sheet.addRow([
      '', '', '', 'TOTALES', '', '',
      result.summary.total_ves, result.summary.total_usd,
      '', '', '', '', `${result.summary.total_invoices} facturas`,
    ]);
    totalsRow.font = { bold: true };

    // Aging summary sheet
    const agingSheet = workbook.addWorksheet('Resumen Antigüedad');
    agingSheet.addRow(['Rango', 'Cantidad', 'Total VES', 'Total USD']).font = { bold: true };
    for (const [bucket, data] of Object.entries(result.summary.aging_buckets)) {
      agingSheet.addRow([bucket, data.count, data.total_ves, data.total_usd]);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=cuentas_por_pagar.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

// GET /reports/accounts-payable/csv
router.get('/accounts-payable/csv', authenticate, async (req, res, next) => {
  try {
    const result = await reportService.getAccountsPayable(req.query);
    const headers = ['Nº Factura', 'Nº Control', 'RIF', 'Proveedor', 'Fecha Emisión', 'Moneda', 'Total VES', 'Total USD', 'Días', 'Antigüedad', 'Categoría', 'Centro Costo', 'Estado'];
    const rows = result.all_invoices.map((inv) => [
      inv.invoice_number, inv.control_number, inv.supplier_rif, `"${inv.supplier_name}"`,
      new Date(inv.emission_date).toLocaleDateString('es-VE'), inv.currency,
      parseFloat(inv.total_ves), parseFloat(inv.total_usd),
      inv.days_pending, inv.aging, inv.category_name || '', inv.cost_center_name || '', inv.status,
    ].join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=cuentas_por_pagar.csv');
    res.send('\uFEFF' + csv); // BOM for Excel UTF-8
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════
// GASTOS POR CATEGORÍA (Expenses by Category)
// ═══════════════════════════════════════════════════════════════

// GET /reports/expenses-by-category
router.get('/expenses-by-category', authenticate, async (req, res, next) => {
  try {
    const result = await reportService.getExpensesByCategory(req.query);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// GET /reports/expenses-by-category/pdf
router.get('/expenses-by-category/pdf', authenticate, async (req, res, next) => {
  try {
    const PDFDocument = require('pdfkit');
    const db = require('../database/connection');
    const result = await reportService.getExpensesByCategory(req.query);
    const companyName = (await db('config').where({ key: 'company_name' }).first())?.value || '';
    const companyRif = (await db('config').where({ key: 'company_rif' }).first())?.value || '';

    const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=gastos_por_categoria${req.query.period ? '_' + req.query.period.replace('/', '-') : ''}.pdf`);
    doc.pipe(res);

    doc.fontSize(14).text('REPORTE DE GASTOS POR CATEGORÍA', { align: 'center' });
    doc.fontSize(10).text(`${companyName} - ${companyRif}`, { align: 'center' });
    if (req.query.period) doc.text(`Período: ${req.query.period}`, { align: 'center' });
    doc.fontSize(9).text(`Generado: ${new Date().toLocaleDateString('es-VE')}`, { align: 'center' });
    doc.moveDown();

    // Summary
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text(`Total General: ${result.summary.total_ves.toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES | ${result.summary.total_usd.toLocaleString('es-VE', { minimumFractionDigits: 2 })} USD | ${result.summary.total_invoices} facturas`);
    doc.moveDown();

    // By category table
    doc.fontSize(11).text('Desglose por Categoría', { underline: true });
    doc.moveDown(0.5);

    const headers = ['Categoría', 'Código', 'Facturas', 'Base Imp.', 'Exento', 'IVA', 'Total VES', 'Total USD'];
    const colWidths = [120, 55, 50, 70, 60, 60, 80, 70];
    let x = 40;
    doc.fontSize(8).font('Helvetica-Bold');
    headers.forEach((h, i) => { doc.text(h, x, doc.y, { width: colWidths[i] }); x += colWidths[i]; });
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(7);

    for (const cat of result.by_category) {
      x = 40;
      if (doc.y > 700) { doc.addPage(); }
      const row = [
        (cat.category || '').substring(0, 25), cat.category_code,
        cat.invoice_count,
        parseFloat(cat.taxable_total || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 }),
        parseFloat(cat.exempt_total || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 }),
        parseFloat(cat.vat_total || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 }),
        parseFloat(cat.total_ves).toLocaleString('es-VE', { minimumFractionDigits: 2 }),
        parseFloat(cat.total_usd).toLocaleString('es-VE', { minimumFractionDigits: 2 }),
      ];
      row.forEach((val, i) => { doc.text(String(val || ''), x, doc.y, { width: colWidths[i] }); x += colWidths[i]; });
      doc.moveDown(0.3);
    }

    // By cost center
    doc.moveDown();
    doc.fontSize(11).font('Helvetica-Bold').text('Desglose por Centro de Costo', { underline: true });
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(7);
    for (const cc of result.by_cost_center) {
      doc.text(`${cc.cost_center} (${cc.cost_center_code}): ${parseFloat(cc.total_ves).toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES - ${cc.invoice_count} facturas`);
    }

    doc.end();
  } catch (err) { next(err); }
});

// GET /reports/expenses-by-category/excel
router.get('/expenses-by-category/excel', authenticate, async (req, res, next) => {
  try {
    const ExcelJS = require('exceljs');
    const result = await reportService.getExpensesByCategory(req.query);

    const workbook = new ExcelJS.Workbook();

    // Sheet 1: By category
    const catSheet = workbook.addWorksheet('Por Categoría');
    catSheet.mergeCells('A1:H1');
    catSheet.getCell('A1').value = 'GASTOS POR CATEGORÍA' + (req.query.period ? ` - ${req.query.period}` : '');
    catSheet.getCell('A1').font = { bold: true, size: 14 };
    catSheet.addRow([]);
    const hdr1 = catSheet.addRow(['Categoría', 'Código', 'Facturas', 'Base Imponible', 'Exento', 'IVA', 'Total VES', 'Total USD']);
    hdr1.font = { bold: true };
    hdr1.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });

    for (const cat of result.by_category) {
      catSheet.addRow([cat.category, cat.category_code, parseInt(cat.invoice_count),
        parseFloat(cat.taxable_total || 0), parseFloat(cat.exempt_total || 0),
        parseFloat(cat.vat_total || 0), parseFloat(cat.total_ves), parseFloat(cat.total_usd)]);
    }
    catSheet.addRow([]);
    const t1 = catSheet.addRow(['TOTALES', '', result.summary.total_invoices, '', '', '', result.summary.total_ves, result.summary.total_usd]);
    t1.font = { bold: true };

    // Sheet 2: By cost center
    const ccSheet = workbook.addWorksheet('Por Centro de Costo');
    const hdr2 = ccSheet.addRow(['Centro de Costo', 'Código', 'Facturas', 'Total VES', 'Total USD']);
    hdr2.font = { bold: true };
    hdr2.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });
    for (const cc of result.by_cost_center) {
      ccSheet.addRow([cc.cost_center, cc.cost_center_code, parseInt(cc.invoice_count), parseFloat(cc.total_ves), parseFloat(cc.total_usd)]);
    }

    // Sheet 3: Detailed
    const detSheet = workbook.addWorksheet('Detallado');
    const hdr3 = detSheet.addRow(['Categoría', 'Proveedor', 'RIF', 'Facturas', 'Total VES', 'Total USD']);
    hdr3.font = { bold: true };
    hdr3.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });
    for (const d of result.detailed) {
      detSheet.addRow([d.category, d.supplier_name, d.supplier_rif, parseInt(d.invoice_count), parseFloat(d.total_ves), parseFloat(d.total_usd)]);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=gastos_por_categoria${req.query.period ? '_' + req.query.period.replace('/', '-') : ''}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

// GET /reports/expenses-by-category/csv
router.get('/expenses-by-category/csv', authenticate, async (req, res, next) => {
  try {
    const result = await reportService.getExpensesByCategory(req.query);
    const headers = ['Categoría', 'Código', 'Facturas', 'Base Imponible', 'Exento', 'IVA', 'Total VES', 'Total USD'];
    const rows = result.by_category.map((c) => [
      `"${c.category}"`, c.category_code, c.invoice_count,
      parseFloat(c.taxable_total || 0), parseFloat(c.exempt_total || 0),
      parseFloat(c.vat_total || 0), parseFloat(c.total_ves), parseFloat(c.total_usd),
    ].join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=gastos_por_categoria${req.query.period ? '_' + req.query.period.replace('/', '-') : ''}.csv`);
    res.send('\uFEFF' + csv);
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════
// MOVIMIENTOS POR PROVEEDOR (Supplier Movements)
// ═══════════════════════════════════════════════════════════════

// GET /reports/supplier-movements/:id
router.get('/supplier-movements/:id', authenticate, async (req, res, next) => {
  try {
    const result = await reportService.getSupplierMovements(req.params.id, req.query);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// GET /reports/supplier-movements/:id/pdf
router.get('/supplier-movements/:id/pdf', authenticate, async (req, res, next) => {
  try {
    const PDFDocument = require('pdfkit');
    const db = require('../database/connection');
    const result = await reportService.getSupplierMovements(req.params.id, req.query);
    const companyName = (await db('config').where({ key: 'company_name' }).first())?.value || '';

    const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=movimientos_${result.supplier.rif}.pdf`);
    doc.pipe(res);

    doc.fontSize(14).text('ESTADO DE CUENTA - PROVEEDOR', { align: 'center' });
    doc.fontSize(10).text(companyName, { align: 'center' });
    doc.moveDown(0.5);

    doc.fontSize(10).font('Helvetica-Bold');
    doc.text(`Proveedor: ${result.supplier.business_name}`);
    doc.font('Helvetica').text(`RIF: ${result.supplier.rif}`);
    doc.text(`Dirección: ${result.supplier.fiscal_address || 'N/A'}`);
    if (req.query.from_date || req.query.to_date) {
      doc.text(`Período: ${req.query.from_date || '...'} al ${req.query.to_date || '...'}`);
    }
    doc.moveDown();

    // Summary
    doc.font('Helvetica-Bold').fontSize(9);
    doc.text(`Facturado VES: ${result.summary.total_invoiced_ves.toLocaleString('es-VE', { minimumFractionDigits: 2 })} | Pagado: ${result.summary.total_paid.toLocaleString('es-VE', { minimumFractionDigits: 2 })} | Retenido: ${result.summary.total_withheld.toLocaleString('es-VE', { minimumFractionDigits: 2 })} | Saldo: ${result.summary.balance_ves.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`);
    doc.moveDown();

    // Invoices
    doc.fontSize(11).text('FACTURAS', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(7).font('Helvetica');
    for (const inv of result.invoices) {
      doc.text(`${new Date(inv.emission_date).toLocaleDateString('es-VE')} | ${inv.document_type} ${inv.invoice_number} | ${inv.description || ''} | ${parseFloat(inv.total_ves).toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES | ${inv.status}`);
    }

    // Payments
    doc.moveDown();
    doc.fontSize(11).font('Helvetica-Bold').text('PAGOS', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(7).font('Helvetica');
    for (const pay of result.payments) {
      doc.text(`${new Date(pay.payment_date).toLocaleDateString('es-VE')} | Ref: ${pay.reference_number} | Fact: ${pay.invoice_number} | ${parseFloat(pay.amount_applied).toLocaleString('es-VE', { minimumFractionDigits: 2 })} ${pay.currency}`);
    }

    // Withholdings
    doc.moveDown();
    doc.fontSize(11).font('Helvetica-Bold').text('RETENCIONES', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(7).font('Helvetica');
    for (const w of result.withholdings) {
      doc.text(`${new Date(w.withholding_date).toLocaleDateString('es-VE')} | ${w.type} | Comp: ${w.voucher_number} | Base: ${parseFloat(w.base_amount).toLocaleString('es-VE', { minimumFractionDigits: 2 })} | Retenido: ${parseFloat(w.amount_ves).toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES`);
    }

    doc.end();
  } catch (err) { next(err); }
});

// GET /reports/supplier-movements/:id/excel
router.get('/supplier-movements/:id/excel', authenticate, async (req, res, next) => {
  try {
    const ExcelJS = require('exceljs');
    const result = await reportService.getSupplierMovements(req.params.id, req.query);

    const workbook = new ExcelJS.Workbook();

    // Summary sheet
    const sumSheet = workbook.addWorksheet('Resumen');
    sumSheet.addRow(['ESTADO DE CUENTA']).font = { bold: true, size: 14 };
    sumSheet.addRow([`Proveedor: ${result.supplier.business_name}`]);
    sumSheet.addRow([`RIF: ${result.supplier.rif}`]);
    sumSheet.addRow([]);
    sumSheet.addRow(['Concepto', 'Monto VES']).font = { bold: true };
    sumSheet.addRow(['Total Facturado', result.summary.total_invoiced_ves]);
    sumSheet.addRow(['Total Pagado', result.summary.total_paid]);
    sumSheet.addRow(['Total Retenido', result.summary.total_withheld]);
    sumSheet.addRow(['Saldo Pendiente', result.summary.balance_ves]);

    // Invoices sheet
    const invSheet = workbook.addWorksheet('Facturas');
    const ih = invSheet.addRow(['Fecha', 'Tipo', 'Nº Factura', 'Nº Control', 'Descripción', 'Moneda', 'Total VES', 'Total USD', 'Estado']);
    ih.font = { bold: true };
    ih.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });
    for (const inv of result.invoices) {
      invSheet.addRow([
        new Date(inv.emission_date).toLocaleDateString('es-VE'), inv.document_type, inv.invoice_number,
        inv.control_number, inv.description, inv.currency,
        parseFloat(inv.total_ves), parseFloat(inv.total_usd), inv.status,
      ]);
    }

    // Payments sheet
    const paySheet = workbook.addWorksheet('Pagos');
    const ph = paySheet.addRow(['Fecha', 'Referencia', 'Método', 'Factura', 'Monto Aplicado', 'Moneda', 'Monto Total']);
    ph.font = { bold: true };
    ph.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });
    for (const pay of result.payments) {
      paySheet.addRow([
        new Date(pay.payment_date).toLocaleDateString('es-VE'), pay.reference_number, pay.payment_method,
        pay.invoice_number, parseFloat(pay.amount_applied), pay.currency, parseFloat(pay.amount),
      ]);
    }

    // Withholdings sheet
    const whSheet = workbook.addWorksheet('Retenciones');
    const wh = whSheet.addRow(['Fecha', 'Tipo', 'Comprobante', 'Base', 'Tasa', 'Retenido VES', 'Retenido USD']);
    wh.font = { bold: true };
    wh.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });
    for (const w of result.withholdings) {
      whSheet.addRow([
        new Date(w.withholding_date).toLocaleDateString('es-VE'), w.type, w.voucher_number,
        parseFloat(w.base_amount), parseFloat(w.rate), parseFloat(w.amount_ves), parseFloat(w.amount_usd),
      ]);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=movimientos_${result.supplier.rif}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

// GET /reports/supplier-movements/:id/csv
router.get('/supplier-movements/:id/csv', authenticate, async (req, res, next) => {
  try {
    const result = await reportService.getSupplierMovements(req.params.id, req.query);
    const lines = [`ESTADO DE CUENTA: ${result.supplier.business_name} (${result.supplier.rif})`];
    lines.push(`Facturado VES: ${result.summary.total_invoiced_ves},Pagado: ${result.summary.total_paid},Retenido: ${result.summary.total_withheld},Saldo: ${result.summary.balance_ves}`);
    lines.push('');

    lines.push('--- FACTURAS ---');
    lines.push('Fecha,Tipo,Nº Factura,Nº Control,Descripción,Moneda,Total VES,Total USD,Estado');
    for (const inv of result.invoices) {
      lines.push([
        new Date(inv.emission_date).toLocaleDateString('es-VE'), inv.document_type, inv.invoice_number,
        inv.control_number, `"${inv.description || ''}"`, inv.currency,
        parseFloat(inv.total_ves), parseFloat(inv.total_usd), inv.status,
      ].join(','));
    }

    lines.push('');
    lines.push('--- PAGOS ---');
    lines.push('Fecha,Referencia,Método,Factura,Monto Aplicado,Moneda');
    for (const pay of result.payments) {
      lines.push([
        new Date(pay.payment_date).toLocaleDateString('es-VE'), pay.reference_number, pay.payment_method,
        pay.invoice_number, parseFloat(pay.amount_applied), pay.currency,
      ].join(','));
    }

    lines.push('');
    lines.push('--- RETENCIONES ---');
    lines.push('Fecha,Tipo,Comprobante,Base,Tasa,Retenido VES');
    for (const w of result.withholdings) {
      lines.push([
        new Date(w.withholding_date).toLocaleDateString('es-VE'), w.type, w.voucher_number,
        parseFloat(w.base_amount), parseFloat(w.rate), parseFloat(w.amount_ves),
      ].join(','));
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=movimientos_${result.supplier.rif}.csv`);
    res.send('\uFEFF' + lines.join('\n'));
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════
// DIFERENCIAS CAMBIARIAS (Exchange Differences)
// ═══════════════════════════════════════════════════════════════

// GET /reports/exchange-differences
router.get('/exchange-differences', authenticate, async (req, res, next) => {
  try {
    const result = await reportService.getExchangeDifferences(req.query);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// GET /reports/exchange-differences/pdf
router.get('/exchange-differences/pdf', authenticate, async (req, res, next) => {
  try {
    const PDFDocument = require('pdfkit');
    const db = require('../database/connection');
    const result = await reportService.getExchangeDifferences(req.query);
    const companyName = (await db('config').where({ key: 'company_name' }).first())?.value || '';
    const companyRif = (await db('config').where({ key: 'company_rif' }).first())?.value || '';

    const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margin: 30 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=diferencias_cambiarias${req.query.period ? '_' + req.query.period.replace('/', '-') : ''}.pdf`);
    doc.pipe(res);

    doc.fontSize(14).text('REPORTE DE DIFERENCIAS CAMBIARIAS', { align: 'center' });
    doc.fontSize(10).text(`${companyName} - ${companyRif}`, { align: 'center' });
    if (req.query.period) doc.text(`Período: ${req.query.period}`, { align: 'center' });
    doc.fontSize(9).text(`Generado: ${new Date().toLocaleDateString('es-VE')}`, { align: 'center' });
    doc.moveDown();

    // Summary
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text(`Diferencia Total: ${result.summary.total_exchange_difference.toLocaleString('es-VE', { minimumFractionDigits: 2 })} | Ganancias: ${result.summary.total_gains.toLocaleString('es-VE', { minimumFractionDigits: 2 })} | Pérdidas: ${result.summary.total_losses.toLocaleString('es-VE', { minimumFractionDigits: 2 })} | Operaciones: ${result.summary.count}`);
    doc.moveDown();

    // Table
    const headers = ['Fecha', 'Referencia', 'Método', 'Moneda', 'Monto', 'Tasa Cambio', 'Dif. Cambiaria', 'Facturas', 'Proveedor'];
    const colWidths = [65, 90, 75, 45, 80, 70, 80, 90, 140];
    let x = 30;
    doc.fontSize(7).font('Helvetica-Bold');
    headers.forEach((h, i) => { doc.text(h, x, doc.y, { width: colWidths[i] }); x += colWidths[i]; });
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(6);

    for (const pay of result.payments) {
      x = 30;
      if (doc.y > 550) { doc.addPage(); }
      const row = [
        new Date(pay.payment_date).toLocaleDateString('es-VE'), pay.reference_number,
        pay.payment_method, pay.currency,
        parseFloat(pay.amount).toLocaleString('es-VE', { minimumFractionDigits: 2 }),
        parseFloat(pay.exchange_rate).toLocaleString('es-VE', { minimumFractionDigits: 2 }),
        parseFloat(pay.exchange_difference).toLocaleString('es-VE', { minimumFractionDigits: 2 }),
        (pay.related_invoices || '').substring(0, 20),
        (pay.supplier_names || '').substring(0, 30),
      ];
      row.forEach((val, i) => { doc.text(String(val || ''), x, doc.y, { width: colWidths[i] }); x += colWidths[i]; });
      doc.moveDown(0.3);
    }

    doc.end();
  } catch (err) { next(err); }
});

// GET /reports/exchange-differences/excel
router.get('/exchange-differences/excel', authenticate, async (req, res, next) => {
  try {
    const ExcelJS = require('exceljs');
    const result = await reportService.getExchangeDifferences(req.query);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Diferencias Cambiarias');

    sheet.mergeCells('A1:I1');
    sheet.getCell('A1').value = 'DIFERENCIAS CAMBIARIAS' + (req.query.period ? ` - ${req.query.period}` : '');
    sheet.getCell('A1').font = { bold: true, size: 14 };
    sheet.addRow([]);

    const hdr = sheet.addRow(['Fecha', 'Referencia', 'Método', 'Moneda', 'Monto', 'Tasa Cambio', 'Diferencia Cambiaria', 'Facturas Relacionadas', 'Proveedor']);
    hdr.font = { bold: true };
    hdr.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });

    for (const pay of result.payments) {
      const row = sheet.addRow([
        new Date(pay.payment_date).toLocaleDateString('es-VE'), pay.reference_number,
        pay.payment_method, pay.currency, parseFloat(pay.amount), parseFloat(pay.exchange_rate),
        parseFloat(pay.exchange_difference), pay.related_invoices || '', pay.supplier_names || '',
      ]);
      // Color red for losses, green for gains
      const diffCell = row.getCell(7);
      if (parseFloat(pay.exchange_difference) < 0) {
        diffCell.font = { color: { argb: 'FFFF0000' } };
      } else {
        diffCell.font = { color: { argb: 'FF008000' } };
      }
    }

    sheet.addRow([]);
    const totals = sheet.addRow(['', '', '', '', '', 'TOTALES:', result.summary.total_exchange_difference, '', '']);
    totals.font = { bold: true };

    // Summary row
    sheet.addRow(['', '', '', '', '', 'Ganancias:', result.summary.total_gains]);
    sheet.addRow(['', '', '', '', '', 'Pérdidas:', result.summary.total_losses]);
    sheet.addRow(['', '', '', '', '', 'Operaciones:', result.summary.count]);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=diferencias_cambiarias${req.query.period ? '_' + req.query.period.replace('/', '-') : ''}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

// GET /reports/exchange-differences/csv
router.get('/exchange-differences/csv', authenticate, async (req, res, next) => {
  try {
    const result = await reportService.getExchangeDifferences(req.query);
    const headers = ['Fecha', 'Referencia', 'Método', 'Moneda', 'Monto', 'Tasa Cambio', 'Diferencia Cambiaria', 'Facturas', 'Proveedor'];
    const rows = result.payments.map((p) => [
      new Date(p.payment_date).toLocaleDateString('es-VE'), p.reference_number, p.payment_method,
      p.currency, parseFloat(p.amount), parseFloat(p.exchange_rate), parseFloat(p.exchange_difference),
      `"${p.related_invoices || ''}"`, `"${p.supplier_names || ''}"`,
    ].join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=diferencias_cambiarias${req.query.period ? '_' + req.query.period.replace('/', '-') : ''}.csv`);
    res.send('\uFEFF' + csv);
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════
// RESUMEN DE RETENCIONES (Withholdings Summary)
// ═══════════════════════════════════════════════════════════════

// GET /reports/withholdings-summary
router.get('/withholdings-summary', authenticate, async (req, res, next) => {
  try {
    const result = await reportService.getWithholdingsSummary(req.query);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// GET /reports/withholdings-summary/pdf
router.get('/withholdings-summary/pdf', authenticate, async (req, res, next) => {
  try {
    const PDFDocument = require('pdfkit');
    const db = require('../database/connection');
    const result = await reportService.getWithholdingsSummary(req.query);
    const companyName = (await db('config').where({ key: 'company_name' }).first())?.value || '';
    const companyRif = (await db('config').where({ key: 'company_rif' }).first())?.value || '';

    const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=resumen_retenciones${req.query.period ? '_' + req.query.period.replace('/', '-') : ''}.pdf`);
    doc.pipe(res);

    doc.fontSize(14).text('RESUMEN DE RETENCIONES', { align: 'center' });
    doc.fontSize(10).text(`${companyName} - ${companyRif}`, { align: 'center' });
    if (req.query.period) doc.text(`Período: ${req.query.period}`, { align: 'center' });
    doc.fontSize(9).text(`Generado: ${new Date().toLocaleDateString('es-VE')}`, { align: 'center' });
    doc.moveDown();

    // Summary by type
    doc.fontSize(11).font('Helvetica-Bold').text('Por Tipo de Retención', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(9).font('Helvetica');
    for (const [type, data] of Object.entries(result.summary.by_type)) {
      doc.text(`${type}: ${data.count} retenciones | Base: ${data.base_total.toLocaleString('es-VE', { minimumFractionDigits: 2 })} | Retenido: ${data.total_ves.toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES`);
    }
    doc.moveDown();

    // By supplier
    doc.fontSize(11).font('Helvetica-Bold').text('Por Proveedor', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(9).font('Helvetica');
    for (const s of result.by_supplier) {
      doc.text(`${s.supplier_name} (${s.supplier_rif}): ${s.count} retenciones | ${s.total_ves.toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES`);
    }
    doc.moveDown();

    // Detail table
    doc.fontSize(11).font('Helvetica-Bold').text('Detalle', { underline: true });
    doc.moveDown(0.5);

    const headers = ['Fecha', 'Tipo', 'Comprobante', 'RIF', 'Proveedor', 'Base', 'Tasa', 'Retenido VES'];
    const colWidths = [60, 35, 80, 80, 100, 65, 35, 70];
    let x = 40;
    doc.fontSize(7).font('Helvetica-Bold');
    headers.forEach((h, i) => { doc.text(h, x, doc.y, { width: colWidths[i] }); x += colWidths[i]; });
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(6);

    for (const w of result.withholdings) {
      x = 40;
      if (doc.y > 700) { doc.addPage(); }
      const row = [
        new Date(w.withholding_date).toLocaleDateString('es-VE'), w.type, w.voucher_number,
        w.supplier_rif, (w.supplier_name || '').substring(0, 25),
        parseFloat(w.base_amount).toLocaleString('es-VE', { minimumFractionDigits: 2 }),
        `${parseFloat(w.rate)}%`,
        parseFloat(w.amount_ves).toLocaleString('es-VE', { minimumFractionDigits: 2 }),
      ];
      row.forEach((val, i) => { doc.text(String(val || ''), x, doc.y, { width: colWidths[i] }); x += colWidths[i]; });
      doc.moveDown(0.3);
    }

    doc.moveDown();
    doc.font('Helvetica-Bold').fontSize(9);
    doc.text(`TOTAL RETENIDO: ${result.summary.total_ves.toLocaleString('es-VE', { minimumFractionDigits: 2 })} VES | ${result.summary.total_usd.toLocaleString('es-VE', { minimumFractionDigits: 2 })} USD`);

    doc.end();
  } catch (err) { next(err); }
});

// GET /reports/withholdings-summary/excel
router.get('/withholdings-summary/excel', authenticate, async (req, res, next) => {
  try {
    const ExcelJS = require('exceljs');
    const result = await reportService.getWithholdingsSummary(req.query);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Retenciones');

    sheet.mergeCells('A1:H1');
    sheet.getCell('A1').value = 'RESUMEN DE RETENCIONES' + (req.query.period ? ` - ${req.query.period}` : '');
    sheet.getCell('A1').font = { bold: true, size: 14 };
    sheet.addRow([]);

    const hdr = sheet.addRow(['Fecha', 'Tipo', 'Comprobante', 'RIF', 'Proveedor', 'Base Imponible', 'Tasa %', 'Retenido VES', 'Retenido USD']);
    hdr.font = { bold: true };
    hdr.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });

    for (const w of result.withholdings) {
      sheet.addRow([
        new Date(w.withholding_date).toLocaleDateString('es-VE'), w.type, w.voucher_number,
        w.supplier_rif, w.supplier_name, parseFloat(w.base_amount),
        parseFloat(w.rate), parseFloat(w.amount_ves), parseFloat(w.amount_usd),
      ]);
    }
    sheet.addRow([]);
    const t = sheet.addRow(['', '', '', '', 'TOTALES', '', '', result.summary.total_ves, result.summary.total_usd]);
    t.font = { bold: true };

    // By supplier sheet
    const supSheet = workbook.addWorksheet('Por Proveedor');
    const sh = supSheet.addRow(['Proveedor', 'RIF', 'Cantidad', 'Total VES']);
    sh.font = { bold: true };
    sh.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });
    for (const s of result.by_supplier) {
      supSheet.addRow([s.supplier_name, s.supplier_rif, s.count, s.total_ves]);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=resumen_retenciones${req.query.period ? '_' + req.query.period.replace('/', '-') : ''}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

// GET /reports/withholdings-summary/csv
router.get('/withholdings-summary/csv', authenticate, async (req, res, next) => {
  try {
    const result = await reportService.getWithholdingsSummary(req.query);
    const headers = ['Fecha', 'Tipo', 'Comprobante', 'RIF', 'Proveedor', 'Base Imponible', 'Tasa %', 'Retenido VES', 'Retenido USD'];
    const rows = result.withholdings.map((w) => [
      new Date(w.withholding_date).toLocaleDateString('es-VE'), w.type, w.voucher_number,
      w.supplier_rif, `"${w.supplier_name}"`, parseFloat(w.base_amount),
      parseFloat(w.rate), parseFloat(w.amount_ves), parseFloat(w.amount_usd),
    ].join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=resumen_retenciones${req.query.period ? '_' + req.query.period.replace('/', '-') : ''}.csv`);
    res.send('\uFEFF' + csv);
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════
// RESUMEN DE PAGOS (Payment Summary)
// ═══════════════════════════════════════════════════════════════

// GET /reports/payment-summary
router.get('/payment-summary', authenticate, async (req, res, next) => {
  try {
    const result = await reportService.getPaymentSummary(req.query);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// GET /reports/payment-summary/pdf
router.get('/payment-summary/pdf', authenticate, async (req, res, next) => {
  try {
    const PDFDocument = require('pdfkit');
    const db = require('../database/connection');
    const result = await reportService.getPaymentSummary(req.query);
    const companyName = (await db('config').where({ key: 'company_name' }).first())?.value || '';
    const companyRif = (await db('config').where({ key: 'company_rif' }).first())?.value || '';

    const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margin: 30 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=resumen_pagos${req.query.period ? '_' + req.query.period.replace('/', '-') : ''}.pdf`);
    doc.pipe(res);

    doc.fontSize(14).text('RESUMEN DE PAGOS', { align: 'center' });
    doc.fontSize(10).text(`${companyName} - ${companyRif}`, { align: 'center' });
    if (req.query.period) doc.text(`Período: ${req.query.period}`, { align: 'center' });
    doc.fontSize(9).text(`Generado: ${new Date().toLocaleDateString('es-VE')}`, { align: 'center' });
    doc.moveDown();

    // Summary
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text(`Total: ${result.summary.total_amount.toLocaleString('es-VE', { minimumFractionDigits: 2 })} | Pagos: ${result.summary.total_count} | ISLR Retenido: ${result.summary.total_islr.toLocaleString('es-VE', { minimumFractionDigits: 2 })} | IVA Retenido: ${result.summary.total_iva.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`);
    doc.moveDown(0.5);

    // By method
    doc.fontSize(9);
    const methodStr = Object.entries(result.summary.by_method).map(([m, d]) => `${m}: ${d.count} (${d.total.toLocaleString('es-VE', { minimumFractionDigits: 2 })})`).join(' | ');
    doc.text(`Por Método: ${methodStr}`);
    doc.moveDown();

    // Table
    const headers = ['Fecha', 'Referencia', 'Método', 'Moneda', 'Monto', 'Tasa Cambio', 'Dif. Camb.', 'ISLR Ret.', 'IVA Ret.', 'Observaciones'];
    const colWidths = [60, 95, 70, 40, 75, 65, 65, 60, 60, 140];
    let x = 30;
    doc.fontSize(7).font('Helvetica-Bold');
    headers.forEach((h, i) => { doc.text(h, x, doc.y, { width: colWidths[i] }); x += colWidths[i]; });
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(6);

    for (const pay of result.payments) {
      x = 30;
      if (doc.y > 550) { doc.addPage(); }
      const row = [
        new Date(pay.payment_date).toLocaleDateString('es-VE'), pay.reference_number,
        pay.payment_method, pay.currency,
        parseFloat(pay.amount).toLocaleString('es-VE', { minimumFractionDigits: 2 }),
        parseFloat(pay.exchange_rate).toLocaleString('es-VE', { minimumFractionDigits: 2 }),
        parseFloat(pay.exchange_difference || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 }),
        parseFloat(pay.islr_withheld || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 }),
        parseFloat(pay.iva_withheld || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 }),
        (pay.observations || '').substring(0, 30),
      ];
      row.forEach((val, i) => { doc.text(String(val || ''), x, doc.y, { width: colWidths[i] }); x += colWidths[i]; });
      doc.moveDown(0.3);
    }

    doc.end();
  } catch (err) { next(err); }
});

// GET /reports/payment-summary/excel
router.get('/payment-summary/excel', authenticate, async (req, res, next) => {
  try {
    const ExcelJS = require('exceljs');
    const result = await reportService.getPaymentSummary(req.query);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Pagos');

    sheet.mergeCells('A1:J1');
    sheet.getCell('A1').value = 'RESUMEN DE PAGOS' + (req.query.period ? ` - ${req.query.period}` : '');
    sheet.getCell('A1').font = { bold: true, size: 14 };
    sheet.addRow([]);

    const hdr = sheet.addRow(['Fecha', 'Referencia', 'Método', 'Moneda', 'Monto', 'Tasa Cambio', 'Dif. Cambiaria', 'ISLR Retenido', 'IVA Retenido', 'Observaciones']);
    hdr.font = { bold: true };
    hdr.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });

    for (const pay of result.payments) {
      sheet.addRow([
        new Date(pay.payment_date).toLocaleDateString('es-VE'), pay.reference_number,
        pay.payment_method, pay.currency, parseFloat(pay.amount), parseFloat(pay.exchange_rate),
        parseFloat(pay.exchange_difference || 0), parseFloat(pay.islr_withheld || 0),
        parseFloat(pay.iva_withheld || 0), pay.observations || '',
      ]);
    }
    sheet.addRow([]);
    const t = sheet.addRow(['', '', '', 'TOTALES', result.summary.total_amount, '', '', result.summary.total_islr, result.summary.total_iva, '']);
    t.font = { bold: true };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=resumen_pagos${req.query.period ? '_' + req.query.period.replace('/', '-') : ''}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

// GET /reports/payment-summary/csv
router.get('/payment-summary/csv', authenticate, async (req, res, next) => {
  try {
    const result = await reportService.getPaymentSummary(req.query);
    const headers = ['Fecha', 'Referencia', 'Método', 'Moneda', 'Monto', 'Tasa Cambio', 'Dif. Cambiaria', 'ISLR Retenido', 'IVA Retenido', 'Observaciones'];
    const rows = result.payments.map((p) => [
      new Date(p.payment_date).toLocaleDateString('es-VE'), p.reference_number, p.payment_method,
      p.currency, parseFloat(p.amount), parseFloat(p.exchange_rate),
      parseFloat(p.exchange_difference || 0), parseFloat(p.islr_withheld || 0),
      parseFloat(p.iva_withheld || 0), `"${p.observations || ''}"`,
    ].join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=resumen_pagos${req.query.period ? '_' + req.query.period.replace('/', '-') : ''}.csv`);
    res.send('\uFEFF' + csv);
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════
// AUDITORÍA (Audit Log)
// ═══════════════════════════════════════════════════════════════

// GET /reports/audit-log
router.get('/audit-log', authenticate, async (req, res, next) => {
  try {
    const result = await auditService.getAuditLogs(req.query);
    res.json({ success: true, data: result.data, pagination: { total: result.total, page: result.page, limit: result.limit, pages: Math.ceil(result.total / result.limit) } });
  } catch (err) { next(err); }
});

// GET /reports/audit-log/excel
router.get('/audit-log/excel', authenticate, async (req, res, next) => {
  try {
    const result = await auditService.getAuditLogs({ ...req.query, limit: 5000 });
    const ExcelJS = require('exceljs');

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Auditoría');

    sheet.mergeCells('A1:G1');
    sheet.getCell('A1').value = 'REGISTRO DE AUDITORÍA';
    sheet.getCell('A1').font = { bold: true, size: 14 };
    sheet.addRow([]);

    const hdr = sheet.addRow(['Fecha', 'Usuario', 'Email', 'Entidad', 'ID Entidad', 'Acción', 'IP']);
    hdr.font = { bold: true };
    hdr.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });

    for (const log of result.data) {
      sheet.addRow([
        new Date(log.created_at).toLocaleString('es-VE'), log.user_name || 'Sistema',
        log.user_email || '', log.entity_type, log.entity_id, log.action, log.ip_address || '',
      ]);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=registro_auditoria.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

// GET /reports/audit-log/csv
router.get('/audit-log/csv', authenticate, async (req, res, next) => {
  try {
    const result = await auditService.getAuditLogs({ ...req.query, limit: 5000 });
    const headers = ['Fecha', 'Usuario', 'Email', 'Entidad', 'ID Entidad', 'Acción', 'IP'];
    const rows = result.data.map((log) => [
      new Date(log.created_at).toLocaleString('es-VE'), `"${log.user_name || 'Sistema'}"`,
      log.user_email || '', log.entity_type, log.entity_id, log.action, log.ip_address || '',
    ].join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=registro_auditoria.csv');
    res.send('\uFEFF' + csv);
  } catch (err) { next(err); }
});

module.exports = router;
