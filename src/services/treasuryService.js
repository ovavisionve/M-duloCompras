const db = require('../database/connection');
const { round2 } = require('../utils/helpers');
const { AppError } = require('../middleware/errorHandler');
const auditService = require('./auditService');

/**
 * Create a new treasury operation (FX purchase cycle)
 * Step 1: VES leaves company → recorded as Préstamos Accionista vs Banco
 */
async function createOperation(data, userId, ip) {
  const { operation_date, amount_ves, source_bank_account_id, description,
    bcv_rate, invoice_id, supplier_name } = data;

  if (!operation_date || !amount_ves) {
    throw new AppError('Fecha y monto VES son requeridos', 400);
  }

  const [operation] = await db('treasury_operations').insert({
    operation_date,
    amount_ves: round2(amount_ves),
    source_bank_account_id: source_bank_account_id || null,
    description: description || null,
    bcv_rate: bcv_rate || null,
    invoice_id: invoice_id || null,
    supplier_name: supplier_name || null,
    status: 'pendiente',
    created_by: userId,
  }).returning('*');

  // Ledger entries: Debit Préstamos Accionista, Credit Banco VES
  const accounts = await db('internal_accounts').whereIn('code', ['PREST_ACC', 'BANCO_VES']);
  const prestAcc = accounts.find((a) => a.code === 'PREST_ACC');
  const bancoVes = accounts.find((a) => a.code === 'BANCO_VES');

  await db('treasury_ledger').insert([
    { operation_id: operation.id, account_id: prestAcc.id, movement_type: 'debito', amount: round2(amount_ves), currency: 'VES', description: 'Salida VES para compra de divisas', movement_date: operation_date },
    { operation_id: operation.id, account_id: bancoVes.id, movement_type: 'credito', amount: round2(amount_ves), currency: 'VES', description: 'Salida de banco VES', movement_date: operation_date },
  ]);

  await auditService.logAction(userId, 'treasury_operation', operation.id, 'create', null, operation, ip);
  return operation;
}

/**
 * Receive USD - Step 2: USD arrives → Banco/Caja USD vs Préstamos Accionista
 * Also calculates exchange difference
 */
async function receiveUsd(operationId, data, userId, ip) {
  const { amount_usd, parallel_rate, destination_type, destination_bank_account_id } = data;

  if (!amount_usd || !parallel_rate) {
    throw new AppError('Monto USD y tasa paralela son requeridos', 400);
  }

  const operation = await db('treasury_operations').where({ id: operationId }).first();
  if (!operation) throw new AppError('Operación no encontrada', 404);
  if (operation.status === 'anulada') throw new AppError('Operación anulada', 400);
  if (operation.status === 'completada') throw new AppError('Operación ya completada', 400);

  // Calculate exchange difference
  // What the USD cost in VES at parallel rate vs what they'd cost at BCV
  const costAtParallel = round2(amount_usd * parallel_rate);
  const bcvRate = operation.bcv_rate || parallel_rate;
  const costAtBcv = round2(amount_usd * bcvRate);
  const exchangeDiff = round2(costAtBcv - costAtParallel);
  // Positive = gain (bought cheaper than BCV), Negative = loss (bought more expensive)

  const [updated] = await db('treasury_operations').where({ id: operationId }).update({
    amount_usd: round2(amount_usd),
    parallel_rate,
    destination_type: destination_type || 'banco_usd',
    destination_bank_account_id: destination_bank_account_id || null,
    exchange_difference: exchangeDiff,
    status: 'usd_recibido',
    updated_at: new Date(),
  }).returning('*');

  // Ledger entries: Debit Banco/Caja USD, Credit Préstamos Accionista
  const destCode = destination_type === 'caja_usd' ? 'CAJA_USD' : 'BANCO_USD';
  const accounts = await db('internal_accounts').whereIn('code', [destCode, 'PREST_ACC', 'GAN_CAMB', 'PERD_CAMB']);
  const destAcc = accounts.find((a) => a.code === destCode);
  const prestAcc = accounts.find((a) => a.code === 'PREST_ACC');

  const ledgerEntries = [
    { operation_id: operationId, account_id: destAcc.id, movement_type: 'debito', amount: round2(amount_usd), currency: 'USD', description: `Ingreso USD (tasa paralela: ${parallel_rate})`, movement_date: operation.operation_date },
    { operation_id: operationId, account_id: prestAcc.id, movement_type: 'credito', amount: round2(operation.amount_ves), currency: 'VES', description: 'Liquidación préstamo accionista', movement_date: operation.operation_date },
  ];

  // Record exchange difference
  if (exchangeDiff !== 0) {
    const diffAcc = accounts.find((a) => a.code === (exchangeDiff > 0 ? 'GAN_CAMB' : 'PERD_CAMB'));
    ledgerEntries.push({
      operation_id: operationId, account_id: diffAcc.id,
      movement_type: exchangeDiff > 0 ? 'credito' : 'debito',
      amount: Math.abs(exchangeDiff), currency: 'VES',
      description: `Diferencial cambiario: BCV ${bcvRate} vs Paralelo ${parallel_rate}`,
      movement_date: operation.operation_date,
    });
  }

  await db('treasury_ledger').insert(ledgerEntries);
  await auditService.logAction(userId, 'treasury_operation', operationId, 'update', operation, updated, ip);
  return updated;
}

/**
 * Mark operation as completed (after supplier payment is done)
 */
async function completeOperation(operationId, data, userId, ip) {
  const operation = await db('treasury_operations').where({ id: operationId }).first();
  if (!operation) throw new AppError('Operación no encontrada', 404);

  const [updated] = await db('treasury_operations').where({ id: operationId }).update({
    payment_id: data.payment_id || operation.payment_id,
    status: 'completada',
    notes: data.notes || operation.notes,
    updated_at: new Date(),
  }).returning('*');

  await auditService.logAction(userId, 'treasury_operation', operationId, 'update', operation, updated, ip);
  return updated;
}

/**
 * Void an operation
 */
async function voidOperation(operationId, reason, userId, ip) {
  const operation = await db('treasury_operations').where({ id: operationId }).first();
  if (!operation) throw new AppError('Operación no encontrada', 404);
  if (operation.status === 'anulada') throw new AppError('Ya está anulada', 400);

  const [updated] = await db('treasury_operations').where({ id: operationId }).update({
    status: 'anulada',
    notes: `ANULADA: ${reason}. ${operation.notes || ''}`,
    updated_at: new Date(),
  }).returning('*');

  await auditService.logAction(userId, 'treasury_operation', operationId, 'void', operation, updated, ip);
  return updated;
}

/**
 * List operations with filters
 */
async function listOperations({ status, from_date, to_date, page = 1, limit = 20 }) {
  const query = db('treasury_operations')
    .leftJoin('users', 'treasury_operations.created_by', 'users.id')
    .select('treasury_operations.*', 'users.full_name as created_by_name');

  if (status) query.where('treasury_operations.status', status);
  if (from_date) query.where('treasury_operations.operation_date', '>=', from_date);
  if (to_date) query.where('treasury_operations.operation_date', '<=', to_date);

  const [{ count }] = await query.clone().count();
  const data = await query.orderBy('treasury_operations.operation_date', 'desc').limit(limit).offset((page - 1) * limit);

  return { data, pagination: { total: parseInt(count), page: parseInt(page), limit: parseInt(limit) } };
}

/**
 * Get operation detail with ledger entries
 */
async function getOperationById(id) {
  const operation = await db('treasury_operations')
    .leftJoin('users', 'treasury_operations.created_by', 'users.id')
    .where('treasury_operations.id', id)
    .select('treasury_operations.*', 'users.full_name as created_by_name')
    .first();

  if (!operation) throw new AppError('Operación no encontrada', 404);

  const ledger = await db('treasury_ledger')
    .join('internal_accounts', 'treasury_ledger.account_id', 'internal_accounts.id')
    .where('treasury_ledger.operation_id', id)
    .select('treasury_ledger.*', 'internal_accounts.name as account_name', 'internal_accounts.code as account_code')
    .orderBy('treasury_ledger.created_at');

  return { ...operation, ledger };
}

/**
 * Monthly summary: totals, gain/loss, grouped by month
 */
async function getMonthlySummary(period) {
  // period = 'MM/YYYY'
  const [month, year] = period.split('/');
  const startDate = `${year}-${month}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0]; // last day of month

  const operations = await db('treasury_operations')
    .where('operation_date', '>=', startDate)
    .where('operation_date', '<=', endDate)
    .whereNot('status', 'anulada')
    .orderBy('operation_date');

  const totalVes = operations.reduce((s, o) => s + parseFloat(o.amount_ves || 0), 0);
  const totalUsd = operations.reduce((s, o) => s + parseFloat(o.amount_usd || 0), 0);
  const totalDiff = operations.reduce((s, o) => s + parseFloat(o.exchange_difference || 0), 0);
  const gains = operations.filter((o) => parseFloat(o.exchange_difference || 0) > 0);
  const losses = operations.filter((o) => parseFloat(o.exchange_difference || 0) < 0);

  // Account balances for the period
  const ledgerSummary = await db('treasury_ledger')
    .join('internal_accounts', 'treasury_ledger.account_id', 'internal_accounts.id')
    .join('treasury_operations', 'treasury_ledger.operation_id', 'treasury_operations.id')
    .where('treasury_ledger.movement_date', '>=', startDate)
    .where('treasury_ledger.movement_date', '<=', endDate)
    .whereNot('treasury_operations.status', 'anulada')
    .groupBy('internal_accounts.code', 'internal_accounts.name')
    .select(
      'internal_accounts.code',
      'internal_accounts.name',
      db.raw('SUM(CASE WHEN treasury_ledger.movement_type = \'debito\' THEN treasury_ledger.amount ELSE 0 END) as total_debito'),
      db.raw('SUM(CASE WHEN treasury_ledger.movement_type = \'credito\' THEN treasury_ledger.amount ELSE 0 END) as total_credito'),
    );

  return {
    period,
    operations_count: operations.length,
    total_ves_out: round2(totalVes),
    total_usd_in: round2(totalUsd),
    avg_parallel_rate: operations.length ? round2(totalVes / (totalUsd || 1)) : 0,
    net_exchange_difference: round2(totalDiff),
    total_gains: round2(gains.reduce((s, o) => s + parseFloat(o.exchange_difference || 0), 0)),
    total_losses: round2(Math.abs(losses.reduce((s, o) => s + parseFloat(o.exchange_difference || 0), 0))),
    account_balances: ledgerSummary,
    operations,
  };
}

/**
 * Get internal accounts list
 */
async function getAccounts() {
  return db('internal_accounts').where({ is_active: true }).orderBy('code');
}

module.exports = {
  createOperation,
  receiveUsd,
  completeOperation,
  voidOperation,
  listOperations,
  getOperationById,
  getMonthlySummary,
  getAccounts,
};
