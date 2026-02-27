const db = require('../database/connection');
const { round2 } = require('../utils/helpers');
const { AppError } = require('../middleware/errorHandler');
const auditService = require('./auditService');

/**
 * Import bank statement movements
 */
async function importMovements(bankAccountId, movements) {
  const account = await db('bank_accounts').where({ id: bankAccountId }).first();
  if (!account) throw new AppError('Cuenta bancaria no encontrada', 404, 'NOT_FOUND');

  const inserted = [];
  for (const mov of movements) {
    const [record] = await db('bank_movements').insert({
      bank_account_id: bankAccountId,
      movement_date: mov.date,
      reference: mov.reference || null,
      description: mov.description || null,
      debit: parseFloat(mov.debit) || 0,
      credit: parseFloat(mov.credit) || 0,
      balance: mov.balance != null ? parseFloat(mov.balance) : null,
    }).returning('*');
    inserted.push(record);
  }

  return { imported: inserted.length, movements: inserted };
}

/**
 * Auto-reconcile movements with payments
 */
async function autoReconcile(bankAccountId) {
  const unmatched = await db('bank_movements')
    .where({ bank_account_id: bankAccountId, reconciliation_status: 'pendiente' })
    .whereNotNull('reference')
    .where('debit', '>', 0);

  let matched = 0;
  for (const mov of unmatched) {
    // Try exact match: reference + amount + date range (±3 days)
    const payment = await db('payments')
      .where({ reference_number: mov.reference, status: 'activo' })
      .where('amount', mov.debit)
      .whereBetween('payment_date', [
        new Date(new Date(mov.movement_date).getTime() - 3 * 86400000).toISOString().split('T')[0],
        new Date(new Date(mov.movement_date).getTime() + 3 * 86400000).toISOString().split('T')[0],
      ])
      .first();

    if (payment) {
      await db('bank_movements').where({ id: mov.id }).update({
        matched_payment_id: payment.id,
        reconciliation_status: 'conciliado',
        updated_at: new Date(),
      });
      matched++;
    }
  }

  // Mark remaining as unidentified if no reference
  await db('bank_movements')
    .where({ bank_account_id: bankAccountId, reconciliation_status: 'pendiente' })
    .whereNull('reference')
    .update({ reconciliation_status: 'no_identificado' });

  return { total_processed: unmatched.length, matched, unmatched: unmatched.length - matched };
}

/**
 * Manual reconciliation
 */
async function manualReconcile(movementId, paymentId, userId, ip) {
  const movement = await db('bank_movements').where({ id: movementId }).first();
  if (!movement) throw new AppError('Movimiento no encontrado', 404, 'NOT_FOUND');

  const payment = await db('payments').where({ id: paymentId }).first();
  if (!payment) throw new AppError('Pago no encontrado', 404, 'NOT_FOUND');

  await db('bank_movements').where({ id: movementId }).update({
    matched_payment_id: paymentId,
    reconciliation_status: 'conciliado',
    updated_at: new Date(),
  });

  await auditService.logAction(userId, 'bank_movement', movementId, 'update',
    { reconciliation_status: movement.reconciliation_status },
    { reconciliation_status: 'conciliado', matched_payment_id: paymentId }, ip);

  return { movement_id: movementId, payment_id: paymentId, status: 'conciliado' };
}

/**
 * Get reconciliation report for a period
 */
async function getReconciliationReport(bankAccountId, period) {
  const account = await db('bank_accounts').where({ id: bankAccountId }).first();
  if (!account) throw new AppError('Cuenta bancaria no encontrada', 404, 'NOT_FOUND');

  const [month, year] = period.split('/');
  const startDate = `${year}-${month}-01`;
  const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];

  const movements = await db('bank_movements')
    .leftJoin('payments', 'bank_movements.matched_payment_id', 'payments.id')
    .where('bank_movements.bank_account_id', bankAccountId)
    .whereBetween('bank_movements.movement_date', [startDate, endDate])
    .select('bank_movements.*', 'payments.reference_number as payment_reference');

  const conciliados = movements.filter((m) => m.reconciliation_status === 'conciliado');
  const pendientes = movements.filter((m) => m.reconciliation_status === 'pendiente');
  const noIdentificados = movements.filter((m) => m.reconciliation_status === 'no_identificado');

  const totalDebits = movements.reduce((s, m) => s + parseFloat(m.debit || 0), 0);
  const totalCredits = movements.reduce((s, m) => s + parseFloat(m.credit || 0), 0);

  return {
    account: { bank_name: account.bank_name, account_number: account.account_number, currency: account.currency },
    period,
    summary: {
      total_movements: movements.length,
      conciliados: conciliados.length,
      pendientes: pendientes.length,
      no_identificados: noIdentificados.length,
      total_debits: round2(totalDebits),
      total_credits: round2(totalCredits),
    },
    movements,
  };
}

module.exports = { importMovements, autoReconcile, manualReconcile, getReconciliationReport };
