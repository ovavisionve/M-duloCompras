const db = require('../database/connection');
const { round2 } = require('../utils/helpers');
const { AppError } = require('../middleware/errorHandler');
const auditService = require('./auditService');
const webhookService = require('./webhookService');
const invoiceService = require('./invoiceService');

/**
 * Register a new payment
 */
async function createPayment(data, userId, ip, orgId) {
  if (!data.invoice_allocations?.length) {
    throw new AppError('Debe asignar el pago a al menos una factura', 400, 'MISSING_INVOICES');
  }

  // Validate total allocated matches amount
  const totalAllocated = data.invoice_allocations.reduce((sum, a) => sum + parseFloat(a.amount), 0);
  if (Math.abs(totalAllocated - parseFloat(data.amount)) > 0.01) {
    throw new AppError('El monto asignado no coincide con el monto del pago', 400, 'AMOUNT_MISMATCH');
  }

  // Validate each invoice and check no over-payment
  for (const alloc of data.invoice_allocations) {
    const invoice = await db('invoices').where({ id: alloc.invoice_id }).first();
    if (!invoice) throw new AppError(`Factura ${alloc.invoice_id} no encontrada`, 404, 'INVOICE_NOT_FOUND');
    if (['anulada', 'borrador'].includes(invoice.status)) {
      throw new AppError(`Factura ${invoice.invoice_number} no permite pagos en estatus ${invoice.status}`, 400, 'INVALID_INVOICE_STATUS');
    }

    // Calculate existing payments + withholdings
    const [paymentsSum] = await db('payment_invoices')
      .join('payments', 'payment_invoices.payment_id', 'payments.id')
      .where({ 'payment_invoices.invoice_id': alloc.invoice_id, 'payments.status': 'activo' })
      .sum('payment_invoices.amount_applied as total');
    const [withholdingsSum] = await db('withholding_invoices')
      .join('withholdings', 'withholding_invoices.withholding_id', 'withholdings.id')
      .where({ 'withholding_invoices.invoice_id': alloc.invoice_id, 'withholdings.status': 'activa' })
      .sum('withholding_invoices.withheld_amount as total');

    const totalPaid = parseFloat(paymentsSum?.total) || 0;
    const totalWithheld = parseFloat(withholdingsSum?.total) || 0;
    const remaining = round2(parseFloat(invoice.total_amount) - totalPaid - totalWithheld);

    if (parseFloat(alloc.amount) > remaining + 0.01) {
      throw new AppError(`El monto asignado a factura ${invoice.invoice_number} excede el saldo pendiente (${remaining})`, 400, 'OVER_PAYMENT');
    }
  }

  // Calculate exchange difference
  const exchangeRate = parseFloat(data.exchange_rate);
  let amountOtherCurrency;
  if (data.currency === 'USD') {
    amountOtherCurrency = round2(parseFloat(data.amount) * exchangeRate);
  } else {
    amountOtherCurrency = round2(parseFloat(data.amount) / exchangeRate);
  }

  // Calculate exchange difference for each invoice
  let totalExchangeDiff = 0;
  for (const alloc of data.invoice_allocations) {
    const invoice = await db('invoices').where({ id: alloc.invoice_id }).first();
    if (invoice.currency !== data.currency) {
      const invoiceRate = parseFloat(invoice.exchange_rate);
      const diff = round2(parseFloat(alloc.amount) * (exchangeRate - invoiceRate));
      totalExchangeDiff += diff;
    }
  }

  // Wrap insert + links in a transaction for atomicity
  const payment = await db.transaction(async (trx) => {
    const [pay] = await trx('payments').insert({
      payment_date: data.payment_date,
      payment_method: data.payment_method,
      sender_bank_id: data.sender_bank_id || null,
      receiver_bank_id: data.receiver_bank_id || null,
      reference_number: data.reference_number || null,
      currency: data.currency,
      amount: data.amount,
      exchange_rate: exchangeRate,
      amount_other_currency: amountOtherCurrency,
      exchange_difference: totalExchangeDiff,
      islr_withheld: data.islr_withheld || 0,
      iva_withheld: data.iva_withheld || 0,
      attachment_path: data.attachment_path || null,
      observations: data.observations || null,
      created_by: userId,
      organization_id: orgId,
    }).returning('*');

    // Link payment to invoices
    for (const alloc of data.invoice_allocations) {
      await trx('payment_invoices').insert({
        payment_id: pay.id,
        invoice_id: alloc.invoice_id,
        amount_applied: alloc.amount,
      });
    }

    return pay;
  });

  // Recalculate invoice statuses (outside trx so it reads committed data)
  for (const alloc of data.invoice_allocations) {
    await invoiceService.recalculateInvoiceStatus(alloc.invoice_id);
  }

  await auditService.logAction(userId, 'payment', payment.id, 'create', null, payment, ip);
  webhookService.emit('payment.registered', {
    id: payment.id,
    invoice_ids: data.invoice_allocations.map((a) => a.invoice_id),
    amount: payment.amount,
    currency: payment.currency,
    method: payment.payment_method,
  });

  return payment;
}

/**
 * Void a payment
 */
async function voidPayment(id, reason, userId, ip, orgId) {
  if (!reason) throw new AppError('Debe indicar el motivo de anulación', 400, 'MISSING_REASON');

  const payment = await db('payments').where({ id, organization_id: orgId }).first();
  if (!payment) throw new AppError('Pago no encontrado', 404, 'NOT_FOUND');
  if (payment.status === 'anulado') throw new AppError('El pago ya está anulado', 400, 'ALREADY_VOIDED');

  const [updated] = await db('payments').where({ id }).update({
    status: 'anulado',
    void_reason: reason,
    updated_at: new Date(),
  }).returning('*');

  // Recalculate linked invoice statuses
  const links = await db('payment_invoices').where({ payment_id: id });
  for (const link of links) {
    await invoiceService.recalculateInvoiceStatus(link.invoice_id);
  }

  await auditService.logAction(userId, 'payment', id, 'void', { status: 'activo' }, { status: 'anulado', void_reason: reason }, ip);
  return updated;
}

/**
 * List payments
 */
async function listPayments(filters = {}, orgId) {
  const query = db('payments').select('payments.*');
  if (orgId) query.where('payments.organization_id', orgId);

  if (filters.payment_method) query.where('payment_method', filters.payment_method);
  if (filters.currency) query.where('currency', filters.currency);
  if (filters.status) query.where('status', filters.status);
  if (filters.from_date) query.where('payment_date', '>=', filters.from_date);
  if (filters.to_date) query.where('payment_date', '<=', filters.to_date);

  const page = parseInt(filters.page) || 1;
  const limit = parseInt(filters.limit) || 20;
  const [{ count }] = await query.clone().clearSelect().count();
  const data = await query.orderBy('payment_date', 'desc').limit(limit).offset((page - 1) * limit);

  return { data, total: parseInt(count), page, limit };
}

/**
 * Get payment detail
 */
async function getPaymentById(id, orgId) {
  const query = db('payments').where({ id });
  if (orgId) query.where('organization_id', orgId);
  const payment = await query.first();
  if (!payment) throw new AppError('Pago no encontrado', 404, 'NOT_FOUND');

  payment.invoices = await db('payment_invoices')
    .join('invoices', 'payment_invoices.invoice_id', 'invoices.id')
    .join('suppliers', 'invoices.supplier_id', 'suppliers.id')
    .where('payment_invoices.payment_id', id)
    .select('invoices.invoice_number', 'invoices.total_amount', 'invoices.currency',
      'suppliers.business_name as supplier_name', 'payment_invoices.amount_applied');

  return payment;
}

module.exports = { createPayment, voidPayment, listPayments, getPaymentById };
