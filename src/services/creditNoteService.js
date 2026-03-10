const db = require('../database/connection');
const { round2 } = require('../utils/helpers');
const { AppError } = require('../middleware/errorHandler');
const auditService = require('./auditService');
const webhookService = require('./webhookService');
const invoiceService = require('./invoiceService');

/**
 * Apply a credit note (NC) to one or more invoices
 */
async function applyCreditNote(creditNoteId, applications, userId, ip, orgId) {
  const creditNote = await db('invoices')
    .where({ id: creditNoteId, organization_id: orgId })
    .first();

  if (!creditNote) throw new AppError('Nota de crédito no encontrada', 404, 'NOT_FOUND');
  if (creditNote.document_type !== 'NC') {
    throw new AppError('El documento no es una Nota de Crédito', 400, 'NOT_CREDIT_NOTE');
  }
  if (['anulada', 'borrador'].includes(creditNote.status)) {
    throw new AppError('La Nota de Crédito debe estar registrada para aplicarse', 400, 'INVALID_STATUS');
  }

  // Calculate already applied amount
  const [{ total: alreadyApplied }] = await db('credit_note_applications')
    .where({ credit_note_id: creditNoteId })
    .sum('amount_applied as total');
  const totalAlreadyApplied = parseFloat(alreadyApplied) || 0;
  const creditNoteTotal = parseFloat(creditNote.total_amount);
  const availableCredit = round2(creditNoteTotal - totalAlreadyApplied);

  // Validate total to apply doesn't exceed available
  const totalToApply = applications.reduce((sum, a) => sum + parseFloat(a.amount_applied), 0);
  if (round2(totalToApply) > availableCredit + 0.01) {
    throw new AppError(
      `El monto a aplicar (${totalToApply}) excede el crédito disponible (${availableCredit})`,
      400, 'EXCEEDS_CREDIT'
    );
  }

  const results = [];

  for (const app of applications) {
    const invoice = await db('invoices')
      .where({ id: app.invoice_id, organization_id: orgId })
      .first();

    if (!invoice) throw new AppError(`Factura ${app.invoice_id} no encontrada`, 404, 'INVOICE_NOT_FOUND');
    if (['anulada', 'borrador'].includes(invoice.status)) {
      throw new AppError('No se puede aplicar NC a una factura anulada o en borrador', 400, 'INVALID_INVOICE_STATUS');
    }
    if (!['FC', 'FG', 'ND'].includes(invoice.document_type)) {
      throw new AppError('Solo se puede aplicar NC a facturas o notas de débito', 400, 'INVALID_DOC_TYPE');
    }

    // Check invoice outstanding balance
    const outstanding = await getInvoiceOutstandingBalance(app.invoice_id);
    const amountToApply = parseFloat(app.amount_applied);
    if (amountToApply > outstanding + 0.01) {
      throw new AppError(
        `El monto (${amountToApply}) excede el saldo pendiente de la factura (${outstanding})`,
        400, 'EXCEEDS_INVOICE_BALANCE'
      );
    }

    const [record] = await db('credit_note_applications').insert({
      credit_note_id: creditNoteId,
      invoice_id: app.invoice_id,
      amount_applied: amountToApply,
      applied_date: app.applied_date || new Date().toISOString().split('T')[0],
      applied_by: userId,
      notes: app.notes || null,
      organization_id: orgId,
    }).returning('*');

    results.push(record);

    // Recalculate invoice status
    await recalculateInvoiceStatusWithNC(app.invoice_id);
  }

  // Recalculate credit note status (if fully applied → pagada)
  await recalculateCreditNoteStatus(creditNoteId);

  await auditService.logAction(userId, 'credit_note_application', creditNoteId, 'apply', null, { applications: results }, ip);
  webhookService.emit('credit_note.applied', { credit_note_id: creditNoteId, applications: results });

  return results;
}

/**
 * Remove a credit note application
 */
async function removeApplication(applicationId, userId, ip, orgId) {
  const application = await db('credit_note_applications')
    .where({ id: applicationId, organization_id: orgId })
    .first();

  if (!application) throw new AppError('Aplicación no encontrada', 404, 'NOT_FOUND');

  await db('credit_note_applications').where({ id: applicationId }).del();

  // Recalculate statuses
  await recalculateInvoiceStatusWithNC(application.invoice_id);
  await recalculateCreditNoteStatus(application.credit_note_id);

  await auditService.logAction(userId, 'credit_note_application', applicationId, 'remove', application, null, ip);

  return { removed: true };
}

/**
 * Get applications for a credit note
 */
async function getApplicationsByCreditNote(creditNoteId, orgId) {
  return db('credit_note_applications')
    .join('invoices', 'credit_note_applications.invoice_id', 'invoices.id')
    .join('suppliers', 'invoices.supplier_id', 'suppliers.id')
    .where({ 'credit_note_applications.credit_note_id': creditNoteId })
    .modify((q) => { if (orgId) q.where('credit_note_applications.organization_id', orgId); })
    .select(
      'credit_note_applications.*',
      'invoices.invoice_number',
      'invoices.total_amount as invoice_total',
      'invoices.currency as invoice_currency',
      'suppliers.business_name as supplier_name'
    );
}

/**
 * Get applications for an invoice (credit notes applied to it)
 */
async function getApplicationsByInvoice(invoiceId, orgId) {
  return db('credit_note_applications')
    .join('invoices', 'credit_note_applications.credit_note_id', 'invoices.id')
    .where({ 'credit_note_applications.invoice_id': invoiceId })
    .modify((q) => { if (orgId) q.where('credit_note_applications.organization_id', orgId); })
    .select(
      'credit_note_applications.*',
      'invoices.invoice_number as credit_note_number',
      'invoices.total_amount as credit_note_total',
      'invoices.currency as credit_note_currency'
    );
}

/**
 * Get credit note balance (total - applied)
 */
async function getCreditNoteBalance(creditNoteId, orgId) {
  const creditNote = await db('invoices')
    .where({ id: creditNoteId })
    .modify((q) => { if (orgId) q.where('organization_id', orgId); })
    .first();

  if (!creditNote) throw new AppError('Nota de crédito no encontrada', 404, 'NOT_FOUND');

  const [{ total }] = await db('credit_note_applications')
    .where({ credit_note_id: creditNoteId })
    .sum('amount_applied as total');

  const totalApplied = parseFloat(total) || 0;
  const totalAmount = parseFloat(creditNote.total_amount);
  const remaining = round2(totalAmount - totalApplied);

  return {
    total_amount: totalAmount,
    total_applied: totalApplied,
    remaining,
    currency: creditNote.currency,
    is_fully_applied: remaining <= 0.01,
  };
}

/**
 * List unapplied or partially applied credit notes
 */
async function listPendingCreditNotes(filters = {}, orgId) {
  const query = db('invoices')
    .join('suppliers', 'invoices.supplier_id', 'suppliers.id')
    .leftJoin(
      db('credit_note_applications')
        .select('credit_note_id')
        .sum('amount_applied as total_applied')
        .groupBy('credit_note_id')
        .as('apps'),
      'invoices.id', 'apps.credit_note_id'
    )
    .where('invoices.document_type', 'NC')
    .whereIn('invoices.status', ['registrada', 'pago_parcial'])
    .modify((q) => { if (orgId) q.where('invoices.organization_id', orgId); })
    .whereRaw('COALESCE(apps.total_applied, 0) < invoices.total_amount - 0.01')
    .select(
      'invoices.*',
      'suppliers.rif as supplier_rif',
      'suppliers.business_name as supplier_name',
      db.raw('COALESCE(apps.total_applied, 0) as total_applied'),
      db.raw('invoices.total_amount - COALESCE(apps.total_applied, 0) as remaining_credit')
    );

  if (filters.supplier_id) query.where('invoices.supplier_id', filters.supplier_id);
  if (filters.search) {
    query.where(function () {
      this.where('suppliers.business_name', 'ilike', `%${filters.search}%`)
        .orWhere('invoices.invoice_number', 'ilike', `%${filters.search}%`);
    });
  }

  return query.orderBy('invoices.emission_date', 'desc');
}

/**
 * Get invoice outstanding balance including NC applications
 */
async function getInvoiceOutstandingBalance(invoiceId) {
  const invoice = await db('invoices').where({ id: invoiceId }).first();
  if (!invoice) return 0;

  const [paymentsResult] = await db('payment_invoices')
    .join('payments', 'payment_invoices.payment_id', 'payments.id')
    .where({ 'payment_invoices.invoice_id': invoiceId, 'payments.status': 'activo' })
    .sum('payment_invoices.amount_applied as total');

  const [withholdingsResult] = await db('withholding_invoices')
    .join('withholdings', 'withholding_invoices.withholding_id', 'withholdings.id')
    .where({ 'withholding_invoices.invoice_id': invoiceId, 'withholdings.status': 'activa' })
    .sum('withholding_invoices.withheld_amount as total');

  const [ncResult] = await db('credit_note_applications')
    .where({ invoice_id: invoiceId })
    .sum('amount_applied as total');

  const totalPaid = parseFloat(paymentsResult?.total) || 0;
  const totalWithheld = parseFloat(withholdingsResult?.total) || 0;
  const totalNC = parseFloat(ncResult?.total) || 0;
  const totalAmount = parseFloat(invoice.total_amount);

  return Math.max(0, round2(totalAmount - totalPaid - totalWithheld - totalNC));
}

/**
 * Recalculate invoice status including NC applications
 */
async function recalculateInvoiceStatusWithNC(invoiceId) {
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

  const [ncResult] = await db('credit_note_applications')
    .where({ invoice_id: invoiceId })
    .sum('amount_applied as total_nc');

  const totalPaid = parseFloat(paymentsResult?.total_paid) || 0;
  const totalWithheld = parseFloat(withholdingsResult?.total_withheld) || 0;
  const totalNC = parseFloat(ncResult?.total_nc) || 0;
  const totalCovered = round2(totalPaid + totalWithheld + totalNC);
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

/**
 * Recalculate credit note status (fully applied = pagada)
 */
async function recalculateCreditNoteStatus(creditNoteId) {
  const creditNote = await db('invoices').where({ id: creditNoteId }).first();
  if (!creditNote || creditNote.document_type !== 'NC') return;
  if (['anulada', 'borrador'].includes(creditNote.status)) return;

  const [{ total }] = await db('credit_note_applications')
    .where({ credit_note_id: creditNoteId })
    .sum('amount_applied as total');

  const totalApplied = parseFloat(total) || 0;
  const creditNoteTotal = parseFloat(creditNote.total_amount);

  let newStatus;
  if (totalApplied >= creditNoteTotal - 0.01) {
    newStatus = 'pagada';
  } else if (totalApplied > 0) {
    newStatus = 'pago_parcial';
  } else {
    newStatus = 'registrada';
  }

  if (newStatus !== creditNote.status) {
    await db('invoices').where({ id: creditNoteId }).update({ status: newStatus });
  }
}

module.exports = {
  applyCreditNote,
  removeApplication,
  getApplicationsByCreditNote,
  getApplicationsByInvoice,
  getCreditNoteBalance,
  listPendingCreditNotes,
  getInvoiceOutstandingBalance,
  recalculateInvoiceStatusWithNC,
};
