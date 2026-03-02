const db = require('../database/connection');
const { round2, generateVoucherNumber } = require('../utils/helpers');
const { AppError } = require('../middleware/errorHandler');
const auditService = require('./auditService');
const webhookService = require('./webhookService');
const invoiceService = require('./invoiceService');

/**
 * Generate next correlative voucher number
 * SENIAT format: AAAAMMSSSSSSSS (14 chars) but we use YYYY-TYPE-XXXXXXXX for readability
 */
async function getNextVoucherNumber(type) {
  const key = type === 'ISLR' ? 'withholding_counter_islr' : 'withholding_counter_iva';
  const config = await db('config').where({ key }).first();
  const counter = parseInt(config?.value || '0') + 1;
  await db('config').where({ key }).update({ value: String(counter) });
  const year = new Date().getFullYear();
  return `${year}-${type}-${String(counter).padStart(8, '0')}`;
}

/**
 * Create withholding linked to one or more invoices
 */
async function createWithholding(data, userId, ip) {
  if (!data.invoice_ids?.length) {
    throw new AppError('Debe vincular al menos una factura', 400, 'MISSING_INVOICES');
  }

  // Validate invoices exist and belong to same supplier
  const invoices = await db('invoices').whereIn('id', data.invoice_ids);
  if (invoices.length !== data.invoice_ids.length) {
    throw new AppError('Una o más facturas no fueron encontradas', 404, 'INVOICES_NOT_FOUND');
  }

  const supplierIds = [...new Set(invoices.map((i) => i.supplier_id))];
  if (supplierIds.length > 1) {
    throw new AppError('Todas las facturas deben ser del mismo proveedor', 400, 'MIXED_SUPPLIERS');
  }

  const voucherNumber = await getNextVoucherNumber(data.type);

  // Calculate total base and withholding
  let totalBase = 0;
  const invoiceDetails = [];
  for (const inv of invoices) {
    const base = data.type === 'IVA' ? parseFloat(inv.vat_amount) : parseFloat(inv.total_amount);
    const withheld = round2(base * parseFloat(data.rate) / 100);
    totalBase += base;
    invoiceDetails.push({ invoice_id: inv.id, base_amount: base, withheld_amount: withheld });
  }

  const totalWithheld = round2(totalBase * parseFloat(data.rate) / 100);
  const exchangeRate = parseFloat(data.exchange_rate) || parseFloat(invoices[0].exchange_rate);
  const amountVes = data.type === 'IVA'
    ? round2(totalWithheld * exchangeRate)
    : totalWithheld; // ISLR is usually in VES base
  const amountUsd = round2(amountVes / exchangeRate);

  const [withholding] = await db('withholdings').insert({
    voucher_number: voucherNumber,
    type: data.type,
    supplier_id: supplierIds[0],
    withholding_rule_id: data.withholding_rule_id || null,
    withholding_date: data.withholding_date || new Date().toISOString().split('T')[0],
    fiscal_period: data.fiscal_period || invoices[0].fiscal_period,
    base_amount: totalBase,
    rate: data.rate,
    amount_ves: amountVes,
    amount_usd: amountUsd,
    exchange_rate: exchangeRate,
    created_by: userId,
  }).returning('*');

  // Insert withholding-invoice links
  for (const detail of invoiceDetails) {
    await db('withholding_invoices').insert({
      withholding_id: withholding.id,
      invoice_id: detail.invoice_id,
      base_amount: detail.base_amount,
      withheld_amount: detail.withheld_amount,
    });
  }

  // Recalculate invoice statuses
  for (const inv of invoices) {
    await invoiceService.recalculateInvoiceStatus(inv.id);
  }

  await auditService.logAction(userId, 'withholding', withholding.id, 'create', null, withholding, ip);
  webhookService.emit('withholding.generated', {
    id: withholding.id,
    voucher_number: voucherNumber,
    type: data.type,
    amount_ves: amountVes,
  });

  return withholding;
}

/**
 * Void a withholding
 */
async function voidWithholding(id, reason, userId, ip) {
  const withholding = await db('withholdings').where({ id }).first();
  if (!withholding) throw new AppError('Retención no encontrada', 404, 'NOT_FOUND');
  if (withholding.status === 'anulada') throw new AppError('La retención ya está anulada', 400, 'ALREADY_VOIDED');

  const [updated] = await db('withholdings').where({ id }).update({
    status: 'anulada',
    void_reason: reason,
    updated_at: new Date(),
  }).returning('*');

  // Recalculate invoice statuses
  const linkedInvoices = await db('withholding_invoices').where({ withholding_id: id });
  for (const link of linkedInvoices) {
    await invoiceService.recalculateInvoiceStatus(link.invoice_id);
  }

  await auditService.logAction(userId, 'withholding', id, 'void', { status: 'activa' }, { status: 'anulada', void_reason: reason }, ip);
  return updated;
}

/**
 * List withholdings
 */
async function listWithholdings(filters = {}) {
  const query = db('withholdings')
    .join('suppliers', 'withholdings.supplier_id', 'suppliers.id')
    .select('withholdings.*', 'suppliers.rif as supplier_rif', 'suppliers.business_name as supplier_name');

  if (filters.type) query.where('withholdings.type', filters.type);
  if (filters.supplier_id) query.where('withholdings.supplier_id', filters.supplier_id);
  if (filters.fiscal_period) query.where('withholdings.fiscal_period', filters.fiscal_period);
  if (filters.status) query.where('withholdings.status', filters.status);

  const page = parseInt(filters.page) || 1;
  const limit = parseInt(filters.limit) || 20;
  const [{ count }] = await query.clone().clearSelect().count();
  const data = await query.orderBy('withholdings.withholding_date', 'desc').limit(limit).offset((page - 1) * limit);

  return { data, total: parseInt(count), page, limit };
}

/**
 * Get withholding detail
 */
async function getWithholdingById(id) {
  const withholding = await db('withholdings')
    .join('suppliers', 'withholdings.supplier_id', 'suppliers.id')
    .select('withholdings.*', 'suppliers.rif as supplier_rif', 'suppliers.business_name as supplier_name')
    .where('withholdings.id', id)
    .first();

  if (!withholding) throw new AppError('Retención no encontrada', 404, 'NOT_FOUND');

  withholding.invoices = await db('withholding_invoices')
    .join('invoices', 'withholding_invoices.invoice_id', 'invoices.id')
    .where('withholding_invoices.withholding_id', id)
    .select('invoices.invoice_number', 'invoices.emission_date', 'invoices.total_amount',
      'withholding_invoices.*');

  return withholding;
}

module.exports = { createWithholding, voidWithholding, listWithholdings, getWithholdingById };
