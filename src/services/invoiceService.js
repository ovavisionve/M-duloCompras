const db = require('../database/connection');
const { round2 } = require('../utils/helpers');
const { AppError } = require('../middleware/errorHandler');
const auditService = require('./auditService');
const webhookService = require('./webhookService');

/**
 * Calculate invoice totals
 */
function calculateTotals(data) {
  const taxable = parseFloat(data.taxable_amount) || 0;
  const exempt = parseFloat(data.exempt_amount) || 0;
  const nonSubject = parseFloat(data.non_subject_amount) || 0;
  const vatRate = parseFloat(data.vat_rate) || 16;
  const exchangeRate = parseFloat(data.exchange_rate);
  const igtf = parseFloat(data.igtf_amount) || 0;

  const vatAmount = round2(taxable * vatRate / 100);
  const totalAmount = round2(taxable + exempt + nonSubject + vatAmount + igtf);

  let totalVes, totalUsd;
  if (data.currency === 'USD') {
    totalUsd = totalAmount;
    totalVes = round2(totalAmount * exchangeRate);
  } else {
    totalVes = totalAmount;
    totalUsd = round2(totalAmount / exchangeRate);
  }

  return { vat_amount: vatAmount, total_amount: totalAmount, total_ves: totalVes, total_usd: totalUsd };
}

/**
 * Create a new invoice
 */
async function createInvoice(data, userId, ip) {
  // Validate no duplicate
  const existing = await db('invoices')
    .where({ supplier_id: data.supplier_id, invoice_number: data.invoice_number })
    .andWhere(function () {
      if (data.control_number) {
        this.where('control_number', data.control_number);
      }
    })
    .first();

  if (existing) {
    throw new AppError('Ya existe una factura con este RIF + Número de Factura + Número de Control', 409, 'DUPLICATE_INVOICE');
  }

  // Validate dates
  if (new Date(data.emission_date) > new Date(data.reception_date)) {
    throw new AppError('La fecha de emisión no puede ser posterior a la fecha de recepción', 400, 'INVALID_DATES');
  }

  // NC/ND must reference existing invoice
  if (['NC', 'ND'].includes(data.document_type) && !data.related_invoice_id) {
    throw new AppError('Las Notas de Crédito/Débito deben vincularse a una factura existente', 400, 'MISSING_RELATED_INVOICE');
  }

  // Control number required except for DSF
  if (data.document_type !== 'DSF' && !data.control_number) {
    throw new AppError('El número de control es obligatorio para este tipo de documento', 400, 'MISSING_CONTROL_NUMBER');
  }

  const totals = calculateTotals(data);
  const invoiceData = {
    ...data,
    ...totals,
    status: data.status || 'borrador',
  };

  const [invoice] = await db('invoices').insert(invoiceData).returning('*');

  // Insert items if provided
  if (data.items?.length) {
    const items = data.items.map((item) => ({
      invoice_id: invoice.id,
      description: item.description,
      quantity: item.quantity || 1,
      unit_price: item.unit_price,
      subtotal: round2((item.quantity || 1) * item.unit_price),
      is_taxable: item.is_taxable !== false,
    }));
    await db('invoice_items').insert(items);
  }

  await auditService.logAction(userId, 'invoice', invoice.id, 'create', null, invoice, ip);
  webhookService.emit('invoice.created', { id: invoice.id, supplier_id: invoice.supplier_id, total: invoice.total_amount, currency: invoice.currency });

  return invoice;
}

/**
 * Update an existing invoice
 */
async function updateInvoice(id, data, userId, ip) {
  const invoice = await db('invoices').where({ id }).first();
  if (!invoice) throw new AppError('Factura no encontrada', 404, 'NOT_FOUND');
  if (['pagada', 'anulada'].includes(invoice.status)) {
    throw new AppError('No se puede editar una factura pagada o anulada', 400, 'INVOICE_LOCKED');
  }

  const totals = data.taxable_amount ? calculateTotals({ ...invoice, ...data }) : {};
  const updated = { ...data, ...totals, updated_at: new Date() };

  const [result] = await db('invoices').where({ id }).update(updated).returning('*');

  await auditService.logAction(userId, 'invoice', id, 'update', invoice, result, ip);
  return result;
}

/**
 * Change invoice status
 */
async function changeStatus(id, newStatus, userId, ip) {
  const invoice = await db('invoices').where({ id }).first();
  if (!invoice) throw new AppError('Factura no encontrada', 404, 'NOT_FOUND');

  const oldStatus = invoice.status;
  if (oldStatus === newStatus) return invoice;

  // Only admin can revert pagada/anulada
  if (['pagada', 'anulada'].includes(oldStatus)) {
    const user = await db('users').where({ id: userId }).first();
    if (user?.role !== 'admin') {
      throw new AppError('Solo el administrador puede revertir este estatus', 403, 'FORBIDDEN');
    }
  }

  const [result] = await db('invoices').where({ id }).update({ status: newStatus, updated_at: new Date() }).returning('*');

  await auditService.logAction(userId, 'invoice', id, 'status_change', { status: oldStatus }, { status: newStatus }, ip);
  webhookService.emit('invoice.status_changed', { id, old_status: oldStatus, new_status: newStatus });

  return result;
}

/**
 * Get invoice with relations
 */
async function getInvoiceById(id) {
  const invoice = await db('invoices')
    .join('suppliers', 'invoices.supplier_id', 'suppliers.id')
    .leftJoin('expense_categories', 'invoices.expense_category_id', 'expense_categories.id')
    .leftJoin('cost_centers', 'invoices.cost_center_id', 'cost_centers.id')
    .select(
      'invoices.*',
      'suppliers.rif as supplier_rif',
      'suppliers.business_name as supplier_name',
      'suppliers.taxpayer_type',
      'expense_categories.name as category_name',
      'cost_centers.name as cost_center_name'
    )
    .where('invoices.id', id)
    .first();

  if (!invoice) throw new AppError('Factura no encontrada', 404, 'NOT_FOUND');

  invoice.items = await db('invoice_items').where({ invoice_id: id });
  invoice.payments = await db('payment_invoices')
    .join('payments', 'payment_invoices.payment_id', 'payments.id')
    .where('payment_invoices.invoice_id', id)
    .select('payments.*', 'payment_invoices.amount_applied');
  invoice.withholdings = await db('withholding_invoices')
    .join('withholdings', 'withholding_invoices.withholding_id', 'withholdings.id')
    .where('withholding_invoices.invoice_id', id)
    .select('withholdings.*', 'withholding_invoices.withheld_amount');

  return invoice;
}

/**
 * List invoices with filters and pagination
 */
async function listInvoices(filters = {}) {
  const query = db('invoices')
    .join('suppliers', 'invoices.supplier_id', 'suppliers.id')
    .select(
      'invoices.*',
      'suppliers.rif as supplier_rif',
      'suppliers.business_name as supplier_name'
    );

  if (filters.supplier_id) query.where('invoices.supplier_id', filters.supplier_id);
  if (filters.status) query.where('invoices.status', filters.status);
  if (filters.document_type) query.where('invoices.document_type', filters.document_type);
  if (filters.currency) query.where('invoices.currency', filters.currency);
  if (filters.fiscal_period) query.where('invoices.fiscal_period', filters.fiscal_period);
  if (filters.from_date) query.where('invoices.emission_date', '>=', filters.from_date);
  if (filters.to_date) query.where('invoices.emission_date', '<=', filters.to_date);
  if (filters.search) {
    query.where(function () {
      this.where('suppliers.business_name', 'ilike', `%${filters.search}%`)
        .orWhere('suppliers.rif', 'ilike', `%${filters.search}%`)
        .orWhere('invoices.invoice_number', 'ilike', `%${filters.search}%`);
    });
  }

  const page = parseInt(filters.page) || 1;
  const limit = parseInt(filters.limit) || 20;
  const offset = (page - 1) * limit;

  const [{ count }] = await query.clone().clearSelect().count();

  const data = await query
    .orderBy('invoices.emission_date', 'desc')
    .limit(limit)
    .offset(offset);

  return { data, total: parseInt(count), page, limit };
}

/**
 * Update invoice payment status based on payments + withholdings
 */
async function recalculateInvoiceStatus(invoiceId) {
  const invoice = await db('invoices').where({ id: invoiceId }).first();
  if (!invoice || ['anulada', 'borrador'].includes(invoice.status)) return;

  const [paymentsResult] = await db('payment_invoices')
    .join('payments', 'payment_invoices.payment_id', 'payments.id')
    .where({ 'payment_invoices.invoice_id': invoiceId, 'payments.status': 'activo' })
    .sum('payment_invoices.amount_applied as total_paid');

  const [withholdingsResult] = await db('withholding_invoices')
    .join('withholdings', 'withholding_invoices.withholding_id', 'withholdings.id')
    .where({ 'withholding_invoices.invoice_id': invoiceId, 'withholdings.status': 'activa' })
    .sum('withholding_invoices.withheld_amount as total_withheld');

  const totalPaid = parseFloat(paymentsResult?.total_paid) || 0;
  const totalWithheld = parseFloat(withholdingsResult?.total_withheld) || 0;
  const totalCovered = round2(totalPaid + totalWithheld);
  const invoiceTotal = parseFloat(invoice.total_amount);

  let newStatus;
  if (totalCovered >= invoiceTotal - 0.01) {
    newStatus = 'pagada';
  } else if (totalCovered > 0) {
    newStatus = 'pago_parcial';
  } else {
    newStatus = 'registrada';
  }

  if (newStatus !== invoice.status) {
    await db('invoices').where({ id: invoiceId }).update({ status: newStatus });
  }
}

module.exports = {
  createInvoice, updateInvoice, changeStatus, getInvoiceById,
  listInvoices, recalculateInvoiceStatus, calculateTotals,
};
