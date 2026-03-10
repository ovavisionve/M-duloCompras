const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const purchaseBookService = require('../services/purchaseBookService');

/**
 * @swagger
 * /purchase-book:
 *   get:
 *     summary: Obtener libro de compras del período
 *     description: Retorna todas las entradas del libro de compras para el período fiscal indicado
 *     tags: [Libro de Compras]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         required: true
 *         schema:
 *           type: string
 *           example: "01/2026"
 *         description: Período fiscal en formato MM/YYYY
 *     responses:
 *       200:
 *         description: Libro de compras del período
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
 *                     entries:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Invoice'
 *                     totals:
 *                       type: object
 *                     entry_count:
 *                       type: integer
 *       400:
 *         description: Período no proporcionado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// GET /purchase-book?period=MM/YYYY
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { period } = req.query;
    if (!period) return res.status(400).json({ success: false, error: { message: 'Período requerido (MM/YYYY)' } });
    const book = await purchaseBookService.getPurchaseBook(period, req.user.organizationId);
    res.json({ success: true, data: book });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /purchase-book/validate:
 *   get:
 *     summary: Validar período del libro de compras
 *     description: Valida la integridad y consistencia de las entradas del libro para el período indicado
 *     tags: [Libro de Compras]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         required: true
 *         schema:
 *           type: string
 *           example: "01/2026"
 *         description: Período fiscal en formato MM/YYYY
 *     responses:
 *       200:
 *         description: Resultado de la validación del período
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       400:
 *         description: Error de validación
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// GET /purchase-book/validate?period=MM/YYYY
router.get('/validate', authenticate, async (req, res, next) => {
  try {
    const result = await purchaseBookService.validateBook(req.query.period, req.user.organizationId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /purchase-book/pdf:
 *   get:
 *     summary: Descargar libro de compras en PDF (Art. 75 RLIVA)
 *     description: Genera el libro de compras en formato PDF conforme al Artículo 75 del Reglamento de la Ley de IVA
 *     tags: [Libro de Compras]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         required: true
 *         schema:
 *           type: string
 *           example: "01/2026"
 *         description: Período fiscal en formato MM/YYYY
 *     responses:
 *       200:
 *         description: Archivo PDF del libro de compras
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Período no proporcionado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// GET /purchase-book/pdf?period=MM/YYYY
router.get('/pdf', authenticate, async (req, res, next) => {
  try {
    const PDFDocument = require('pdfkit');
    const orgId = req.user.organizationId;
    const book = await purchaseBookService.getPurchaseBook(req.query.period, orgId);
    const db = require('../database/connection');
    const companyName = (await db('config').where({ key: 'company_name', organization_id: orgId }).first())?.value || '';
    const companyRif = (await db('config').where({ key: 'company_rif', organization_id: orgId }).first())?.value || '';
    const companyAddress = (await db('config').where({ key: 'company_address', organization_id: orgId }).first())?.value || '';

    const doc = new PDFDocument({ size: 'LEGAL', layout: 'landscape', margin: 25 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=libro_compras_${req.query.period.replace('/', '-')}.pdf`);
    doc.pipe(res);

    const fmtNum = (n) => parseFloat(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const pageW = 1008 - 50; // LEGAL landscape width minus margins
    const leftM = 25;

    // ═══════════════════════════════════════════════════
    // Helper to draw page header (repeats on each page)
    // ═══════════════════════════════════════════════════
    const headers = ['Nº', 'Fecha', 'RIF Proveedor', 'Razón Social', 'Nº Factura', 'Nº Control', 'Tipo', 'Base Imponible', 'Exento/Exonerado', 'IVA (Crédito Fiscal)', 'IVA Retenido', 'Nº Comp. Ret.'];
    const colWidths = [28, 55, 80, 135, 65, 65, 30, 78, 72, 72, 62, 80];
    const colAligns = ['center', 'left', 'left', 'left', 'left', 'left', 'center', 'right', 'right', 'right', 'right', 'left'];

    function drawPageHeader() {
      // Company header
      doc.rect(leftM, doc.y, pageW, 40).fill('#1a365d');
      const titleY = doc.y;
      doc.fillColor('#ffffff').fontSize(12).font('Helvetica-Bold')
        .text('LIBRO DE COMPRAS', leftM, titleY + 3, { width: pageW, align: 'center' });
      doc.fontSize(8).font('Helvetica')
        .text(`${companyName}  |  RIF: ${companyRif}  |  ${companyAddress}`, leftM, titleY + 18, { width: pageW, align: 'center' });
      doc.fontSize(8)
        .text(`Período Fiscal: ${req.query.period}`, leftM, titleY + 28, { width: pageW, align: 'center' });
      doc.fillColor('#000000');
      doc.y = titleY + 44;

      // Art. 75 RLIVA reference
      doc.fontSize(6).fillColor('#718096')
        .text('Conforme al Artículo 75 del Reglamento de la Ley de Impuesto al Valor Agregado', leftM, doc.y, { width: pageW, align: 'right' });
      doc.fillColor('#000000');
      doc.moveDown(0.3);

      // Column headers
      const headerY = doc.y;
      doc.rect(leftM, headerY, pageW, 18).fill('#2d3748');
      doc.fillColor('#ffffff').fontSize(6).font('Helvetica-Bold');
      let x = leftM;
      for (let i = 0; i < headers.length; i++) {
        doc.text(headers[i], x + 2, headerY + 3, { width: colWidths[i] - 4, align: 'center' });
        x += colWidths[i];
      }
      doc.fillColor('#000000');
      doc.y = headerY + 20;
    }

    drawPageHeader();

    // ═══════════════════════════════════════════════════
    // TABLE DATA ROWS
    // ═══════════════════════════════════════════════════
    doc.font('Helvetica').fontSize(6.5);
    for (let idx = 0; idx < book.entries.length; idx++) {
      const entry = book.entries[idx];
      if (doc.y > 540) {
        doc.addPage();
        drawPageHeader();
        doc.font('Helvetica').fontSize(6.5);
      }

      const rowY = doc.y;
      if (idx % 2 === 0) doc.rect(leftM, rowY, pageW, 13).fill('#f7fafc');
      doc.fillColor('#000000');
      let x = leftM;

      const row = [
        String(entry.operation_number),
        entry.emission_date,
        entry.supplier_rif,
        (entry.supplier_name || '').substring(0, 28),
        entry.invoice_number,
        entry.control_number || '-',
        entry.document_type,
        fmtNum(entry.taxable_purchases),
        fmtNum(entry.exempt_purchases),
        fmtNum(entry.vat_amount),
        fmtNum(entry.iva_withheld),
        entry.withholding_voucher || '',
      ];

      for (let i = 0; i < row.length; i++) {
        doc.text(row[i], x + 2, rowY + 3, { width: colWidths[i] - 4, align: colAligns[i] });
        x += colWidths[i];
      }
      doc.y = rowY + 14;
    }

    // ═══════════════════════════════════════════════════
    // TOTALS ROW (Art. 72 RLIVA - resumen del período)
    // ═══════════════════════════════════════════════════
    if (doc.y > 540) {
      doc.addPage();
      drawPageHeader();
    }

    doc.moveDown(0.3);
    const totY = doc.y;
    doc.rect(leftM, totY, pageW, 16).fill('#2d3748');
    doc.fillColor('#ffffff').fontSize(7).font('Helvetica-Bold');

    let x = leftM;
    // Fill empty columns up to "Tipo"
    for (let i = 0; i < 6; i++) { x += colWidths[i]; }
    doc.text('TOTALES:', x + 2, totY + 4, { width: colWidths[6] - 4, align: 'center' });
    x += colWidths[6];
    doc.text(fmtNum(book.totals.total_taxable), x + 2, totY + 4, { width: colWidths[7] - 4, align: 'right' });
    x += colWidths[7];
    doc.text(fmtNum(book.totals.total_exempt), x + 2, totY + 4, { width: colWidths[8] - 4, align: 'right' });
    x += colWidths[8];
    doc.text(fmtNum(book.totals.total_vat), x + 2, totY + 4, { width: colWidths[9] - 4, align: 'right' });
    x += colWidths[9];
    doc.text(fmtNum(book.totals.total_iva_withheld), x + 2, totY + 4, { width: colWidths[10] - 4, align: 'right' });

    doc.fillColor('#000000');
    doc.y = totY + 20;

    // Grand total summary
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(9);
    doc.text(`TOTAL GENERAL DEL PERÍODO: Bs. ${fmtNum(book.totals.grand_total)}`, leftM, doc.y, { width: pageW, align: 'right' });
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(7);
    doc.text(`${book.entry_count} operación(es) registrada(s) en el período ${req.query.period}`, leftM, doc.y, { width: pageW, align: 'right' });

    // Footer
    doc.moveDown(1.5);
    doc.fontSize(6).fillColor('#718096');
    doc.text(`Generado el ${new Date().toLocaleDateString('es-VE')} | ${companyName} | RIF: ${companyRif}`, leftM, doc.y, { width: pageW, align: 'center' });

    doc.end();
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /purchase-book/excel:
 *   get:
 *     summary: Descargar libro de compras en Excel
 *     description: Genera el libro de compras en formato Excel (.xlsx) con todas las entradas del período
 *     tags: [Libro de Compras]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         required: true
 *         schema:
 *           type: string
 *           example: "01/2026"
 *         description: Período fiscal en formato MM/YYYY
 *     responses:
 *       200:
 *         description: Archivo Excel del libro de compras
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Período no proporcionado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// GET /purchase-book/excel?period=MM/YYYY
router.get('/excel', authenticate, async (req, res, next) => {
  try {
    const ExcelJS = require('exceljs');
    const book = await purchaseBookService.getPurchaseBook(req.query.period, req.user.organizationId);

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

/**
 * @swagger
 * /purchase-book/seniat:
 *   get:
 *     summary: Exportar libro de compras en TXT para SENIAT
 *     description: Genera el archivo TXT tabulado para importación en el portal del SENIAT
 *     tags: [Libro de Compras]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         required: true
 *         schema:
 *           type: string
 *           example: "01/2026"
 *         description: Período fiscal en formato MM/YYYY
 *     responses:
 *       200:
 *         description: Archivo TXT para el SENIAT
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       400:
 *         description: Período no proporcionado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// GET /purchase-book/seniat?period=MM/YYYY (TXT format)
router.get('/seniat', authenticate, async (req, res, next) => {
  try {
    const book = await purchaseBookService.getPurchaseBook(req.query.period, req.user.organizationId);
    const db = require('../database/connection');
    const companyRif = (await db('config').where({ key: 'company_rif', organization_id: req.user.organizationId }).first())?.value || '';

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

/**
 * @swagger
 * /purchase-book/close:
 *   post:
 *     summary: Cerrar período fiscal del libro de compras
 *     description: Cierra el período fiscal indicado, impidiendo modificaciones posteriores. Requiere rol admin o contador.
 *     tags: [Libro de Compras]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         required: true
 *         schema:
 *           type: string
 *           example: "01/2026"
 *         description: Período fiscal en formato MM/YYYY
 *     responses:
 *       200:
 *         description: Período cerrado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       400:
 *         description: Error al cerrar período
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: No autorizado (requiere rol admin o contador)
 */
// POST /purchase-book/close?period=MM/YYYY
router.post('/close', authenticate, authorize('admin', 'contador'), async (req, res, next) => {
  try {
    const result = await purchaseBookService.closePeriod(req.query.period, req.user.id, req.ip, req.user.organizationId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

module.exports = router;
