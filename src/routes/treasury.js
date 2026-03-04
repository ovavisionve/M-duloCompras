const router = require('express').Router();
const db = require('../database/connection');
const { authenticate, authorize } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const treasuryService = require('../services/treasuryService');
const { round2 } = require('../utils/helpers');

// Only admin and tesorero can access

// GET /treasury/accounts - Internal accounts
router.get('/accounts', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const data = await treasuryService.getAccounts();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// GET /treasury/suppliers - Suppliers for dropdown
router.get('/suppliers', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const data = await db('suppliers').where({ is_active: true }).orderBy('business_name').select('id', 'business_name', 'rif');
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// GET /treasury/summary?period=MM/YYYY
router.get('/summary', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const { period } = req.query;
    if (!period) throw new AppError('Período requerido (MM/YYYY)', 400);
    const data = await treasuryService.getMonthlySummary(period);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// GET /treasury/dashboard - Dashboard data for charts
router.get('/dashboard', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const data = await treasuryService.getDashboardData();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ─── Reports (PDF/Excel) ───

// GET /treasury/reports/operations/pdf
router.get('/reports/operations/pdf', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const PDFDocument = require('pdfkit');
    const result = await treasuryService.listOperations({ ...req.query, limit: 500 });
    const companyName = (await db('config').where({ key: 'company_name' }).first())?.value || 'Comprar-IA';

    const doc = new PDFDocument({ size: 'LEGAL', layout: 'landscape', margin: 30 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=compra_divisas.pdf');
    doc.pipe(res);

    doc.fontSize(14).text('REPORTE DE COMPRA DE DIVISAS', { align: 'center' });
    doc.fontSize(10).text(companyName, { align: 'center' });
    doc.fontSize(8).text(`Generado: ${new Date().toLocaleDateString('es-VE')} | Operaciones: ${result.data.length}`, { align: 'center' });
    doc.moveDown();

    // Summary totals
    const totalVes = result.data.reduce((s, o) => s + parseFloat(o.amount_ves || 0), 0);
    const totalUsd = result.data.reduce((s, o) => s + parseFloat(o.amount_usd || 0), 0);
    const totalDiff = result.data.reduce((s, o) => s + parseFloat(o.diff_usd || 0), 0);
    doc.fontSize(8).font('Helvetica-Bold');
    doc.text(`Total VES: ${totalVes.toLocaleString('es-VE', { minimumFractionDigits: 2 })} | Total USD: ${totalUsd.toLocaleString('es-VE', { minimumFractionDigits: 2 })} | Diferencial: ${totalDiff >= 0 ? '+' : ''}${totalDiff.toLocaleString('es-VE', { minimumFractionDigits: 2 })} USD`);
    doc.moveDown();

    const headers = ['Fecha', 'Tipo', 'Proveedor', 'VES', 'Tasa BCV', 'Tasa Compra', 'USD Real', 'Dif. USD', 'Estado'];
    const colWidths = [65, 80, 170, 95, 70, 70, 80, 80, 60];
    let x = 30;
    doc.fontSize(7).font('Helvetica-Bold');
    headers.forEach((h, i) => { doc.text(h, x, doc.y, { width: colWidths[i] }); x += colWidths[i]; });
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(6);

    for (const op of result.data) {
      x = 30;
      if (doc.y > 550) { doc.addPage(); }
      const row = [
        new Date(op.operation_date).toLocaleDateString('es-VE'),
        op.purchase_type || '-',
        (op.supplier_business_name || op.supplier_name || '-').substring(0, 40),
        parseFloat(op.amount_ves).toLocaleString('es-VE', { minimumFractionDigits: 2 }),
        parseFloat(op.bcv_rate || 0).toFixed(2),
        parseFloat(op.purchase_rate || op.parallel_rate || 0).toFixed(2),
        parseFloat(op.amount_usd || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 }),
        `${parseFloat(op.diff_usd || 0) >= 0 ? '+' : ''}${parseFloat(op.diff_usd || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`,
        op.status,
      ];
      row.forEach((val, i) => { doc.text(String(val), x, doc.y, { width: colWidths[i] }); x += colWidths[i]; });
      doc.moveDown(0.3);
    }
    doc.end();
  } catch (err) { next(err); }
});

// GET /treasury/reports/operations/excel
router.get('/reports/operations/excel', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const ExcelJS = require('exceljs');
    const result = await treasuryService.listOperations({ ...req.query, limit: 500 });

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Compra de Divisas');

    ws.columns = [
      { header: 'Fecha', key: 'date', width: 12 },
      { header: 'Tipo', key: 'type', width: 18 },
      { header: 'Proveedor', key: 'supplier', width: 30 },
      { header: 'VES', key: 'ves', width: 18 },
      { header: 'Tasa BCV', key: 'bcv', width: 14 },
      { header: 'Tasa Compra', key: 'purchase', width: 14 },
      { header: 'USD Real', key: 'usd', width: 16 },
      { header: 'Dif. USD', key: 'diff', width: 14 },
      { header: 'Destino', key: 'dest', width: 14 },
      { header: 'Estado', key: 'status', width: 12 },
    ];

    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    for (const op of result.data) {
      const row = ws.addRow({
        date: new Date(op.operation_date).toLocaleDateString('es-VE'),
        type: op.purchase_type || '-',
        supplier: op.supplier_business_name || op.supplier_name || '-',
        ves: parseFloat(op.amount_ves),
        bcv: parseFloat(op.bcv_rate || 0),
        purchase: parseFloat(op.purchase_rate || op.parallel_rate || 0),
        usd: parseFloat(op.amount_usd || 0),
        diff: parseFloat(op.diff_usd || 0),
        dest: op.destination_type === 'caja_usd' ? 'Caja USD' : 'Banco USD',
        status: op.status,
      });
      // Color diff column
      const diffVal = parseFloat(op.diff_usd || 0);
      row.getCell('diff').font = { color: { argb: diffVal >= 0 ? 'FF16A34A' : 'FFDC2626' } };
      row.getCell('ves').numFmt = '#,##0.00';
      row.getCell('usd').numFmt = '#,##0.00';
      row.getCell('diff').numFmt = '+#,##0.00;-#,##0.00';
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=compra_divisas.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

// GET /treasury/reports/cashflows/pdf
router.get('/reports/cashflows/pdf', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const PDFDocument = require('pdfkit');
    const result = await treasuryService.listCashFlows({ ...req.query, limit: 500 });
    const companyName = (await db('config').where({ key: 'company_name' }).first())?.value || 'Comprar-IA';

    const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=posicion_cambiaria.pdf');
    doc.pipe(res);

    doc.fontSize(14).text('POSICIÓN CAMBIARIA - MOVIMIENTOS', { align: 'center' });
    doc.fontSize(10).text(companyName, { align: 'center' });
    doc.fontSize(8).text(`Generado: ${new Date().toLocaleDateString('es-VE')} | Movimientos: ${result.data.length}`, { align: 'center' });
    doc.moveDown();

    const headers = ['Fecha', 'Tipo', 'VES', 'USD (entrada)', 'Tasa BCV', 'Origen', 'Descripción'];
    const colWidths = [60, 55, 80, 75, 60, 60, 145];
    let x = 40;
    doc.fontSize(7).font('Helvetica-Bold');
    headers.forEach((h, i) => { doc.text(h, x, doc.y, { width: colWidths[i] }); x += colWidths[i]; });
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(6);

    for (const f of result.data) {
      x = 40;
      if (doc.y > 700) { doc.addPage(); }
      const row = [
        new Date(f.flow_date).toLocaleDateString('es-VE'),
        f.flow_type === 'ingreso' ? 'INGRESO' : 'EGRESO',
        `${f.flow_type === 'ingreso' ? '+' : '-'}${parseFloat(f.amount_ves).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`,
        parseFloat(f.usd_equivalent).toLocaleString('es-VE', { minimumFractionDigits: 2 }),
        parseFloat(f.bcv_rate).toFixed(2),
        f.reference_type === 'treasury_operation' ? 'Compra USD' : 'Manual',
        (f.description || '-').substring(0, 40),
      ];
      row.forEach((val, i) => { doc.text(String(val), x, doc.y, { width: colWidths[i] }); x += colWidths[i]; });
      doc.moveDown(0.3);
    }
    doc.end();
  } catch (err) { next(err); }
});

// GET /treasury/reports/cashflows/excel
router.get('/reports/cashflows/excel', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const ExcelJS = require('exceljs');
    const result = await treasuryService.listCashFlows({ ...req.query, limit: 500 });

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Posición Cambiaria');

    ws.columns = [
      { header: 'Fecha', key: 'date', width: 12 },
      { header: 'Tipo', key: 'type', width: 12 },
      { header: 'VES', key: 'ves', width: 18 },
      { header: 'USD (entrada)', key: 'usd', width: 16 },
      { header: 'Tasa BCV', key: 'bcv', width: 14 },
      { header: 'Origen', key: 'origin', width: 14 },
      { header: 'Descripción', key: 'desc', width: 40 },
    ];

    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };

    for (const f of result.data) {
      const row = ws.addRow({
        date: new Date(f.flow_date).toLocaleDateString('es-VE'),
        type: f.flow_type === 'ingreso' ? 'Ingreso' : 'Egreso',
        ves: parseFloat(f.amount_ves) * (f.flow_type === 'ingreso' ? 1 : -1),
        usd: parseFloat(f.usd_equivalent),
        bcv: parseFloat(f.bcv_rate),
        origin: f.reference_type === 'treasury_operation' ? 'Compra USD' : 'Manual',
        desc: f.description || '-',
      });
      row.getCell('ves').numFmt = '+#,##0.00;-#,##0.00';
      row.getCell('ves').font = { color: { argb: f.flow_type === 'ingreso' ? 'FF16A34A' : 'FFDC2626' } };
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=posicion_cambiaria.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

// ─── Cash Flow / Posición Cambiaria (MUST be before /:id) ───

// GET /treasury/cash/position - Current cash position with revaluation
router.get('/cash/position', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const data = await treasuryService.getCashPosition();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// GET /treasury/cash/flows - List cash flow movements
router.get('/cash/flows', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const result = await treasuryService.listCashFlows(req.query);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

// GET /treasury/cash/revaluation?from=&to= - Revaluation report
router.get('/cash/revaluation', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const data = await treasuryService.getRevaluationReport(from, to);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// POST /treasury/cash/flows - Record manual VES entry/exit
router.post('/cash/flows', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const data = await treasuryService.recordCashFlow(req.body, req.user.id, req.ip);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

// POST /treasury/cash/flows/:id/void - Void cash flow entry
router.post('/cash/flows/:id/void', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason) throw new AppError('Motivo de anulación requerido', 400);
    const data = await treasuryService.voidCashFlow(req.params.id, reason, req.user.id, req.ip);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// POST /treasury/cash/repair - Repair missing cash flows from old operations
router.post('/cash/repair', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const data = await treasuryService.repairMissingCashFlows(req.user.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// POST /treasury/reset-demo - Clean all treasury data and create 10 sample movements
router.post('/reset-demo', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const data = await treasuryService.resetAndSeedDemo(req.user.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ─── Treasury Operations ───

// GET /treasury - List operations
router.get('/', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const result = await treasuryService.listOperations(req.query);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

// GET /treasury/:id - Detail (must be after all named routes)
router.get('/:id', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const data = await treasuryService.getOperationById(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// POST /treasury - Create (single step: all data at once)
router.post('/', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const data = await treasuryService.createOperation(req.body, req.user.id, req.ip);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

// POST /treasury/:id/void
router.post('/:id/void', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason) throw new AppError('Motivo de anulación requerido', 400);
    const data = await treasuryService.voidOperation(req.params.id, reason, req.user.id, req.ip);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

module.exports = router;
