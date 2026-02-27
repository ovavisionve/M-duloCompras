const db = require('../database/connection');
const { round2 } = require('../utils/helpers');
const { AppError } = require('../middleware/errorHandler');
const auditService = require('./auditService');
const webhookService = require('./webhookService');

/**
 * Generate purchase book for a fiscal period
 */
async function getPurchaseBook(period) {
  const invoices = await db('invoices')
    .join('suppliers', 'invoices.supplier_id', 'suppliers.id')
    .leftJoin('withholding_invoices', 'invoices.id', 'withholding_invoices.invoice_id')
    .leftJoin('withholdings', function () {
      this.on('withholding_invoices.withholding_id', '=', 'withholdings.id')
        .andOn('withholdings.type', '=', db.raw("'IVA'"))
        .andOn('withholdings.status', '=', db.raw("'activa'"));
    })
    .where('invoices.fiscal_period', period)
    .whereIn('invoices.status', ['registrada', 'pago_parcial', 'pagada'])
    .select(
      'invoices.*',
      'suppliers.rif as supplier_rif',
      'suppliers.business_name as supplier_name',
      db.raw('COALESCE(withholding_invoices.withheld_amount, 0) as iva_withheld'),
      db.raw('withholdings.voucher_number as withholding_voucher')
    )
    .orderBy('invoices.emission_date', 'asc');

  // Build SENIAT-format entries
  const entries = invoices.map((inv, index) => {
    const isCredit = inv.document_type === 'NC';
    const sign = isCredit ? -1 : 1;

    return {
      operation_number: index + 1,
      emission_date: inv.emission_date,
      supplier_rif: inv.supplier_rif,
      supplier_name: inv.supplier_name,
      invoice_number: inv.invoice_number,
      control_number: inv.control_number,
      document_type: inv.document_type,
      debit_credit_number: ['ND', 'NC'].includes(inv.document_type) ? inv.invoice_number : null,
      affected_invoice: inv.related_invoice_id ? inv.invoice_number : null,
      taxable_purchases: round2(sign * parseFloat(inv.taxable_amount)),
      exempt_purchases: round2(sign * (parseFloat(inv.exempt_amount) + parseFloat(inv.non_subject_amount))),
      vat_amount: round2(sign * parseFloat(inv.vat_amount)),
      iva_withheld: parseFloat(inv.iva_withheld),
      withholding_voucher: inv.withholding_voucher,
    };
  });

  // Totals
  const totals = entries.reduce(
    (acc, e) => ({
      total_taxable: round2(acc.total_taxable + e.taxable_purchases),
      total_exempt: round2(acc.total_exempt + e.exempt_purchases),
      total_vat: round2(acc.total_vat + e.vat_amount),
      total_iva_withheld: round2(acc.total_iva_withheld + e.iva_withheld),
    }),
    { total_taxable: 0, total_exempt: 0, total_vat: 0, total_iva_withheld: 0 }
  );
  totals.grand_total = round2(totals.total_taxable + totals.total_exempt + totals.total_vat);

  return { period, entries, totals, entry_count: entries.length };
}

/**
 * Close a fiscal period
 */
async function closePeriod(period, userId, ip) {
  const existing = await db('purchase_books').where({ fiscal_period: period }).first();
  if (existing?.status === 'cerrado') {
    throw new AppError('El período ya está cerrado', 400, 'PERIOD_ALREADY_CLOSED');
  }

  const bookData = await getPurchaseBook(period);

  const record = {
    fiscal_period: period,
    status: 'cerrado',
    total_taxable: bookData.totals.total_taxable,
    total_exempt: bookData.totals.total_exempt,
    total_vat: bookData.totals.total_vat,
    total_vat_withheld: bookData.totals.total_iva_withheld,
    grand_total: bookData.totals.grand_total,
    closed_by: userId,
    closed_at: new Date(),
  };

  let result;
  if (existing) {
    [result] = await db('purchase_books').where({ id: existing.id }).update(record).returning('*');
  } else {
    [result] = await db('purchase_books').insert(record).returning('*');
  }

  await auditService.logAction(userId, 'purchase_book', result.id, 'status_change', { status: 'abierto' }, { status: 'cerrado' }, ip);
  webhookService.emit('purchase_book.closed', { period, totals: bookData.totals });

  return result;
}

/**
 * Validate book integrity before closing
 */
async function validateBook(period) {
  const issues = [];

  // Check for invoices without control number
  const noControl = await db('invoices')
    .where({ fiscal_period: period })
    .whereIn('status', ['registrada', 'pago_parcial', 'pagada'])
    .whereNot('document_type', 'DSF')
    .whereNull('control_number')
    .count();
  if (parseInt(noControl[0].count) > 0) {
    issues.push({ type: 'warning', message: `${noControl[0].count} factura(s) sin número de control` });
  }

  // Check for invoices without RIF (via supplier)
  const noRif = await db('invoices')
    .join('suppliers', 'invoices.supplier_id', 'suppliers.id')
    .where({ 'invoices.fiscal_period': period })
    .whereIn('invoices.status', ['registrada', 'pago_parcial', 'pagada'])
    .where('suppliers.rif', '')
    .count();
  if (parseInt(noRif[0].count) > 0) {
    issues.push({ type: 'error', message: `${noRif[0].count} factura(s) con proveedor sin RIF` });
  }

  // Check for draft invoices in period
  const drafts = await db('invoices')
    .where({ fiscal_period: period, status: 'borrador' })
    .count();
  if (parseInt(drafts[0].count) > 0) {
    issues.push({ type: 'warning', message: `${drafts[0].count} factura(s) en borrador no incluidas en el libro` });
  }

  return { period, is_valid: issues.filter((i) => i.type === 'error').length === 0, issues };
}

module.exports = { getPurchaseBook, closePeriod, validateBook };
