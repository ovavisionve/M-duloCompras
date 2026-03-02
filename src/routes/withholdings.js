const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const withholdingService = require('../services/withholdingService');
const { paginate } = require('../utils/helpers');

// GET /withholdings/rules
router.get('/rules', authenticate, async (req, res, next) => {
  try {
    const db = require('../database/connection');
    const query = db('withholding_rules').where({ is_active: true }).orderBy('type').orderBy('concept_code');
    if (req.query.type) query.where('type', req.query.type);
    if (req.query.applies_to) {
      query.where(function () {
        this.where('applies_to', req.query.applies_to).orWhere('applies_to', 'ambos');
      });
    }
    const rules = await query;
    res.json({ success: true, data: rules });
  } catch (err) { next(err); }
});

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

    // Fetch concept codes for withholdings that have a linked rule
    const db = require('../database/connection');
    const ruleIds = [...new Set(result.data.filter((w) => w.withholding_rule_id).map((w) => w.withholding_rule_id))];
    const rules = ruleIds.length ? await db('withholding_rules').whereIn('id', ruleIds) : [];
    const ruleMap = Object.fromEntries(rules.map((r) => [r.id, r]));

    // Generate SENIAT-compatible TXT (Art. 25, Decreto 1808)
    const lines = result.data.map((w) => {
      const rule = ruleMap[w.withholding_rule_id];
      return [
        w.supplier_rif,
        w.fiscal_period.replace('/', ''),
        w.withholding_date,
        w.voucher_number,
        rule ? rule.concept_code : '',
        w.base_amount,
        w.rate,
        w.amount_ves,
      ].join('\t');
    });

    const header = 'RIF\tPeriodo\tFecha\tComprobante\tConcepto\tBase\tPorcentaje\tMonto';
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
    const { fmtDateISO } = require('../utils/helpers');
    const withholding = await withholdingService.getWithholdingById(req.params.id);
    const db = require('../database/connection');
    const companyRif = (await db('config').where({ key: 'company_rif' }).first())?.value || '';
    const companyName = (await db('config').where({ key: 'company_name' }).first())?.value || '';
    const companyAddress = (await db('config').where({ key: 'company_address' }).first())?.value || '';

    // Fetch withholding rule details if available
    let ruleName = '';
    if (withholding.withholding_rule_id) {
      const rule = await db('withholding_rules').where({ id: withholding.withholding_rule_id }).first();
      if (rule) ruleName = rule.concept_name;
    }

    const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=retencion_${withholding.voucher_number}.pdf`);
    doc.pipe(res);

    const fmtNum = (n) => parseFloat(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtDate = (d) => d ? fmtDateISO(d) : '';
    const pageW = 612 - 80; // LETTER width minus margins
    const leftCol = 40;
    const rightCol = 320;

    // ═══════════════════════════════════════════════════
    // HEADER - Title and voucher number
    // ═══════════════════════════════════════════════════
    const isIVA = withholding.type === 'IVA';
    const title = isIVA ? 'COMPROBANTE DE RETENCIÓN DE IVA' : 'COMPROBANTE DE RETENCIÓN DE ISLR';

    doc.rect(leftCol, doc.y, pageW, 28).fill('#2b6cb0');
    doc.fillColor('#ffffff').fontSize(13).font('Helvetica-Bold')
      .text(title, leftCol, doc.y - 26, { width: pageW, align: 'center' });
    doc.fillColor('#000000');
    doc.moveDown(0.8);

    // Voucher number and period - right aligned
    const headerY = doc.y;
    doc.fontSize(9).font('Helvetica-Bold').text('Nº Comprobante:', leftCol, headerY);
    doc.font('Helvetica').text(withholding.voucher_number, leftCol + 100, headerY);
    doc.font('Helvetica-Bold').text('Fecha de Emisión:', rightCol, headerY);
    doc.font('Helvetica').text(fmtDate(withholding.withholding_date), rightCol + 105, headerY);

    const headerY2 = doc.y + 2;
    doc.font('Helvetica-Bold').text('Período Fiscal:', leftCol, headerY2);
    doc.font('Helvetica').text(withholding.fiscal_period, leftCol + 100, headerY2);
    doc.moveDown(1.2);

    // ═══════════════════════════════════════════════════
    // AGENTE DE RETENCIÓN (Company / Buyer)
    // ═══════════════════════════════════════════════════
    const agentBoxY = doc.y;
    doc.rect(leftCol, agentBoxY, pageW, 16).fill('#e2e8f0');
    doc.fillColor('#2b6cb0').fontSize(9).font('Helvetica-Bold')
      .text('AGENTE DE RETENCIÓN', leftCol + 5, agentBoxY + 3, { width: pageW });
    doc.fillColor('#000000');
    doc.y = agentBoxY + 20;

    doc.fontSize(8.5).font('Helvetica-Bold').text('Razón Social:', leftCol + 5, doc.y);
    doc.font('Helvetica').text(companyName, leftCol + 75, doc.y);
    const agLine2 = doc.y + 2;
    doc.font('Helvetica-Bold').text('RIF:', leftCol + 5, agLine2);
    doc.font('Helvetica').text(companyRif, leftCol + 75, agLine2);
    doc.font('Helvetica-Bold').text('Dirección Fiscal:', rightCol, agLine2);
    doc.font('Helvetica').text(companyAddress, rightCol + 90, agLine2, { width: 160 });
    doc.moveDown(1);

    // ═══════════════════════════════════════════════════
    // SUJETO RETENIDO (Supplier)
    // ═══════════════════════════════════════════════════
    const provBoxY = doc.y;
    doc.rect(leftCol, provBoxY, pageW, 16).fill('#e2e8f0');
    doc.fillColor('#2b6cb0').fontSize(9).font('Helvetica-Bold')
      .text('SUJETO RETENIDO', leftCol + 5, provBoxY + 3, { width: pageW });
    doc.fillColor('#000000');
    doc.y = provBoxY + 20;

    doc.fontSize(8.5).font('Helvetica-Bold').text('Razón Social:', leftCol + 5, doc.y);
    doc.font('Helvetica').text(withholding.supplier_name, leftCol + 75, doc.y);
    const prLine2 = doc.y + 2;
    doc.font('Helvetica-Bold').text('RIF:', leftCol + 5, prLine2);
    doc.font('Helvetica').text(withholding.supplier_rif, leftCol + 75, prLine2);
    if (withholding.supplier_address) {
      doc.font('Helvetica-Bold').text('Dirección Fiscal:', rightCol, prLine2);
      doc.font('Helvetica').text(withholding.supplier_address, rightCol + 90, prLine2, { width: 160 });
    }
    doc.moveDown(1.5);

    // ═══════════════════════════════════════════════════
    // INVOICE TABLE (Art. 16 PA SNAT/2015/0049)
    // ═══════════════════════════════════════════════════
    if (isIVA) {
      // IVA Comprobante table columns per Art. 16:
      // Fecha, Nº Factura, Nº Control, Total Factura, Base Imponible, % IVA, IVA Facturado, IVA Retenido
      const cols = [
        { header: 'Fecha', width: 55, align: 'left' },
        { header: 'Nº Factura', width: 65, align: 'left' },
        { header: 'Nº Control', width: 65, align: 'left' },
        { header: 'Total Fact.', width: 70, align: 'right' },
        { header: 'Base Imp.', width: 70, align: 'right' },
        { header: '% IVA', width: 38, align: 'right' },
        { header: 'IVA Fact.', width: 65, align: 'right' },
        { header: 'IVA Retenido', width: 70, align: 'right' },
      ];

      // Table header
      let tableX = leftCol;
      const tableHeaderY = doc.y;
      doc.rect(leftCol, tableHeaderY, pageW, 16).fill('#34567a');
      doc.fillColor('#ffffff').fontSize(7).font('Helvetica-Bold');
      for (const col of cols) {
        doc.text(col.header, tableX + 2, tableHeaderY + 4, { width: col.width - 4, align: col.align });
        tableX += col.width;
      }
      doc.fillColor('#000000');
      doc.y = tableHeaderY + 18;

      // Table rows
      doc.font('Helvetica').fontSize(7.5);
      let totalFacturado = 0;
      let totalBase = 0;
      let totalIvaFact = 0;
      let totalRetenido = 0;

      for (let i = 0; i < (withholding.invoices || []).length; i++) {
        const inv = withholding.invoices[i];
        const rowY = doc.y;
        if (i % 2 === 0) doc.rect(leftCol, rowY, pageW, 14).fill('#f7fafc');
        doc.fillColor('#000000');
        tableX = leftCol;

        const rowData = [
          { val: fmtDate(inv.emission_date), align: 'left' },
          { val: inv.invoice_number || '', align: 'left' },
          { val: inv.control_number || 'N/A', align: 'left' },
          { val: fmtNum(inv.total_amount), align: 'right' },
          { val: fmtNum(inv.base_amount), align: 'right' },
          { val: `${parseFloat(inv.vat_rate || 16).toFixed(0)}%`, align: 'right' },
          { val: fmtNum(inv.vat_amount), align: 'right' },
          { val: fmtNum(inv.withheld_amount), align: 'right' },
        ];

        totalFacturado += parseFloat(inv.total_amount || 0);
        totalBase += parseFloat(inv.base_amount || 0);
        totalIvaFact += parseFloat(inv.vat_amount || 0);
        totalRetenido += parseFloat(inv.withheld_amount || 0);

        for (let j = 0; j < cols.length; j++) {
          doc.text(rowData[j].val, tableX + 2, rowY + 3, { width: cols[j].width - 4, align: rowData[j].align });
          tableX += cols[j].width;
        }
        doc.y = rowY + 15;
      }

      // Totals row
      const totY = doc.y;
      doc.rect(leftCol, totY, pageW, 16).fill('#34567a');
      doc.fillColor('#ffffff').fontSize(7.5).font('Helvetica-Bold');
      tableX = leftCol;
      const totals = ['', '', 'TOTALES:', fmtNum(totalFacturado), fmtNum(totalBase), '', fmtNum(totalIvaFact), fmtNum(totalRetenido)];
      for (let j = 0; j < cols.length; j++) {
        doc.text(totals[j], tableX + 2, totY + 4, { width: cols[j].width - 4, align: cols[j].align || 'right' });
        tableX += cols[j].width;
      }
      doc.fillColor('#000000');
      doc.y = totY + 20;
    } else {
      // ISLR Comprobante table
      // Columns: Fecha, Nº Factura, Concepto, Base Sujeta, % Retención, Sustraendo, Monto Retenido
      const cols = [
        { header: 'Fecha', width: 55, align: 'left' },
        { header: 'Nº Factura', width: 70, align: 'left' },
        { header: 'Concepto', width: 120, align: 'left' },
        { header: 'Base Sujeta', width: 75, align: 'right' },
        { header: '% Ret.', width: 42, align: 'right' },
        { header: 'Sustraendo', width: 65, align: 'right' },
        { header: 'Monto Retenido', width: 75, align: 'right' },
      ];

      let tableX = leftCol;
      const tableHeaderY = doc.y;
      doc.rect(leftCol, tableHeaderY, pageW, 16).fill('#34567a');
      doc.fillColor('#ffffff').fontSize(7).font('Helvetica-Bold');
      for (const col of cols) {
        doc.text(col.header, tableX + 2, tableHeaderY + 4, { width: col.width - 4, align: col.align });
        tableX += col.width;
      }
      doc.fillColor('#000000');
      doc.y = tableHeaderY + 18;

      doc.font('Helvetica').fontSize(7.5);
      let totalBase = 0;
      let totalRetenido = 0;

      for (let i = 0; i < (withholding.invoices || []).length; i++) {
        const inv = withholding.invoices[i];
        const rowY = doc.y;
        if (i % 2 === 0) doc.rect(leftCol, rowY, pageW, 14).fill('#f7fafc');
        doc.fillColor('#000000');
        tableX = leftCol;

        const sustraendo = 0; // Could be calculated from UT value × subtract_ut
        const rowData = [
          { val: fmtDate(inv.emission_date), align: 'left' },
          { val: inv.invoice_number || '', align: 'left' },
          { val: ruleName || 'ISLR', align: 'left' },
          { val: fmtNum(inv.base_amount), align: 'right' },
          { val: `${parseFloat(withholding.rate).toFixed(2)}%`, align: 'right' },
          { val: fmtNum(sustraendo), align: 'right' },
          { val: fmtNum(inv.withheld_amount), align: 'right' },
        ];

        totalBase += parseFloat(inv.base_amount || 0);
        totalRetenido += parseFloat(inv.withheld_amount || 0);

        for (let j = 0; j < cols.length; j++) {
          doc.text(rowData[j].val, tableX + 2, rowY + 3, { width: cols[j].width - 4, align: rowData[j].align });
          tableX += cols[j].width;
        }
        doc.y = rowY + 15;
      }

      const totY = doc.y;
      doc.rect(leftCol, totY, pageW, 16).fill('#34567a');
      doc.fillColor('#ffffff').fontSize(7.5).font('Helvetica-Bold');
      tableX = leftCol;
      const totals = ['', '', 'TOTALES:', fmtNum(totalBase), '', '', fmtNum(totalRetenido)];
      for (let j = 0; j < cols.length; j++) {
        doc.text(totals[j], tableX + 2, totY + 4, { width: cols[j].width - 4, align: cols[j].align || 'right' });
        tableX += cols[j].width;
      }
      doc.fillColor('#000000');
      doc.y = totY + 20;
    }

    // ═══════════════════════════════════════════════════
    // SUMMARY SECTION
    // ═══════════════════════════════════════════════════
    doc.moveDown(0.8);
    const sumY = doc.y;
    doc.rect(leftCol, sumY, pageW, 16).fill('#e2e8f0');
    doc.fillColor('#2b6cb0').fontSize(9).font('Helvetica-Bold')
      .text('RESUMEN', leftCol + 5, sumY + 3, { width: pageW });
    doc.fillColor('#000000');
    doc.y = sumY + 20;

    doc.fontSize(9).font('Helvetica');
    const summaryLeft = leftCol + 10;
    const summaryValX = summaryLeft + 180;

    doc.font('Helvetica-Bold').text('Base Imponible Total:', summaryLeft, doc.y);
    doc.font('Helvetica').text(`Bs. ${fmtNum(withholding.base_amount)}`, summaryValX, doc.y);
    const sl2 = doc.y + 2;
    doc.font('Helvetica-Bold').text(`Porcentaje de Retención:`, summaryLeft, sl2);
    doc.font('Helvetica').text(`${parseFloat(withholding.rate).toFixed(2)}%`, summaryValX, sl2);
    const sl3 = doc.y + 2;
    doc.font('Helvetica-Bold').text('Total Retenido (Bs.):', summaryLeft, sl3);
    doc.font('Helvetica-Bold').fontSize(11).text(`Bs. ${fmtNum(withholding.amount_ves)}`, summaryValX, sl3);
    doc.fontSize(9).font('Helvetica');

    // ═══════════════════════════════════════════════════
    // FOOTER - Legal basis and signatures
    // ═══════════════════════════════════════════════════
    doc.moveDown(2);
    doc.fontSize(7).fillColor('#718096');
    if (isIVA) {
      doc.text('Comprobante emitido conforme al Art. 16 de la Providencia Administrativa SNAT/2025/000054 (G.O. 43.171 del 16/07/2025).', leftCol, doc.y, { width: pageW, align: 'center' });
    } else {
      doc.text('Comprobante emitido conforme al Art. 24 del Decreto 1808 (Reglamento Parcial de Retenciones de ISLR, G.O. 36.203 del 12/05/1997).', leftCol, doc.y, { width: pageW, align: 'center' });
    }
    doc.fillColor('#000000');

    // Signature lines
    doc.moveDown(3);
    const sigY = doc.y;
    const sigWidth = 180;
    doc.moveTo(leftCol + 20, sigY).lineTo(leftCol + 20 + sigWidth, sigY).stroke();
    doc.moveTo(rightCol + 20, sigY).lineTo(rightCol + 20 + sigWidth, sigY).stroke();
    doc.fontSize(8).font('Helvetica');
    doc.text('Agente de Retención', leftCol + 20, sigY + 4, { width: sigWidth, align: 'center' });
    doc.text('Sujeto Retenido', rightCol + 20, sigY + 4, { width: sigWidth, align: 'center' });
    doc.fontSize(7).fillColor('#718096');
    doc.text('(Firma y Sello)', leftCol + 20, sigY + 16, { width: sigWidth, align: 'center' });
    doc.text('(Recibido Conforme)', rightCol + 20, sigY + 16, { width: sigWidth, align: 'center' });

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
