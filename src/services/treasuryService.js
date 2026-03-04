const db = require('../database/connection');
const { round2 } = require('../utils/helpers');
const { AppError } = require('../middleware/errorHandler');
const auditService = require('./auditService');
const exchangeRateService = require('./exchangeRateService');

/**
 * Create a treasury operation (single step)
 *
 * The user inputs:
 *  - amount_ves: bolivares leaving the company
 *  - bcv_rate: official BCV rate of the day (static, auto-fetched)
 *  - purchase_rate: actual rate at which USD were bought (manual)
 *  - purchase_type: efectivo, zelle, paypal, binance, euro, etc.
 *  - supplier_id / supplier_name: who the USD are for
 *
 * The system calculates:
 *  - amount_usd = amount_ves / purchase_rate (actual USD bought)
 *  - usd_at_bcv = amount_ves / bcv_rate (theoretical USD at BCV)
 *  - diff_usd = amount_usd - usd_at_bcv (negative = loss)
 *  - exchange_difference = diff_usd * bcv_rate (in VES)
 *
 * Example: 1,000,000 VES, BCV = 51.27, Parallel = 62.50
 *  - USD at BCV: 1,000,000 / 51.27 = 19,504.59 USD
 *  - USD real:   1,000,000 / 62.50 = 16,000.00 USD
 *  - Loss: 16,000 - 19,504.59 = -3,504.59 USD
 */
async function createOperation(data, userId, ip) {
  const {
    operation_date, amount_ves, bcv_rate, purchase_rate,
    purchase_type, supplier_id, supplier_name,
    description, destination_type, source_bank_account_id, invoice_id,
  } = data;

  if (!operation_date || !amount_ves || !bcv_rate || !purchase_rate) {
    throw new AppError('Fecha, monto VES, tasa BCV y tasa de compra son requeridos', 400);
  }

  const ves = parseFloat(amount_ves);
  const bcv = parseFloat(bcv_rate);
  const pRate = parseFloat(purchase_rate);

  if (ves <= 0 || bcv <= 0 || pRate <= 0) {
    throw new AppError('Los montos y tasas deben ser mayores a 0', 400);
  }

  // Core calculations
  const amountUsd = round2(ves / pRate);
  const usdAtBcv = round2(ves / bcv);
  const diffUsd = round2(amountUsd - usdAtBcv);
  const diffVes = round2(diffUsd * bcv);

  // Resolve supplier name from ID if provided
  let resolvedSupplierName = supplier_name || null;
  if (supplier_id && !resolvedSupplierName) {
    const supplier = await db('suppliers').where({ id: supplier_id }).first();
    if (supplier) resolvedSupplierName = supplier.business_name;
  }

  // Wrap everything in a transaction so all inserts succeed or all roll back
  const operation = await db.transaction(async (trx) => {
    const [op] = await trx('treasury_operations').insert({
      operation_date,
      description: description || null,
      purchase_type: purchase_type || null,
      amount_ves: ves,
      source_bank_account_id: source_bank_account_id || null,
      amount_usd: amountUsd,
      parallel_rate: pRate,
      purchase_rate: pRate,
      bcv_rate: bcv,
      destination_type: destination_type || 'banco_usd',
      exchange_difference: diffVes,
      diff_usd: diffUsd,
      supplier_id: supplier_id || null,
      supplier_name: resolvedSupplierName,
      invoice_id: invoice_id || null,
      status: 'completada',
      created_by: userId,
    }).returning('*');

    // Ledger entries
    const accounts = await trx('internal_accounts')
      .whereIn('code', ['PREST_ACC', 'BANCO_VES', 'BANCO_USD', 'CAJA_USD', 'GAN_CAMB', 'PERD_CAMB']);
    const getAcc = (code) => {
      const acc = accounts.find((a) => a.code === code);
      if (!acc) throw new AppError(`Cuenta interna "${code}" no encontrada. Verifique que las migraciones se ejecutaron correctamente.`, 500);
      return acc;
    };

    const destCode = destination_type === 'caja_usd' ? 'CAJA_USD' : 'BANCO_USD';
    const purchaseLabel = purchase_type ? purchase_type.charAt(0).toUpperCase() + purchase_type.slice(1) : 'Compra';

    const ledgerEntries = [
      { operation_id: op.id, account_id: getAcc('PREST_ACC').id, movement_type: 'debito', amount: ves, currency: 'VES', description: `Salida VES - ${purchaseLabel}`, movement_date: operation_date },
      { operation_id: op.id, account_id: getAcc('BANCO_VES').id, movement_type: 'credito', amount: ves, currency: 'VES', description: 'Salida banco VES', movement_date: operation_date },
      { operation_id: op.id, account_id: getAcc(destCode).id, movement_type: 'debito', amount: amountUsd, currency: 'USD', description: `Ingreso ${amountUsd} USD (${purchaseLabel} a tasa ${pRate})`, movement_date: operation_date },
      { operation_id: op.id, account_id: getAcc('PREST_ACC').id, movement_type: 'credito', amount: ves, currency: 'VES', description: 'Liquidación préstamo accionista', movement_date: operation_date },
    ];

    if (diffVes !== 0) {
      const isGain = diffVes > 0;
      const diffAcc = getAcc(isGain ? 'GAN_CAMB' : 'PERD_CAMB');
      ledgerEntries.push({
        operation_id: op.id, account_id: diffAcc.id,
        movement_type: isGain ? 'credito' : 'debito',
        amount: Math.abs(diffVes), currency: 'VES',
        description: `${isGain ? 'Ganancia' : 'Pérdida'}: ${Math.abs(diffUsd)} USD (BCV ${bcv} vs ${purchaseLabel} ${pRate})`,
        movement_date: operation_date,
      });
    }

    await trx('treasury_ledger').insert(ledgerEntries);

    // Auto-create egreso in cash flows (VES leaving for USD purchase)
    await trx('treasury_cash_flows').insert({
      flow_date: operation_date,
      flow_type: 'egreso',
      amount_ves: ves,
      bcv_rate: bcv,
      usd_equivalent: usdAtBcv,
      description: `Compra ${purchaseLabel}: ${amountUsd} USD a tasa ${pRate}`,
      reference_type: 'treasury_operation',
      reference_id: op.id,
      created_by: userId,
    });

    return op;
  });

  await auditService.logAction(userId, 'treasury_operation', operation.id, 'create', null, operation, ip);
  return operation;
}

/**
 * Void an operation
 */
async function voidOperation(operationId, reason, userId, ip) {
  const operation = await db('treasury_operations').where({ id: operationId }).first();
  if (!operation) throw new AppError('Operación no encontrada', 404);
  if (operation.status === 'anulada') throw new AppError('Ya está anulada', 400);

  await db.transaction(async (trx) => {
    await trx('treasury_operations').where({ id: operationId }).update({
      status: 'anulada',
      notes: `ANULADA: ${reason}. ${operation.notes || ''}`,
      updated_at: new Date(),
    });

    // Also void the associated cash flow
    await trx('treasury_cash_flows')
      .where({ reference_type: 'treasury_operation', reference_id: operationId, status: 'activo' })
      .update({ status: 'anulado', description: db.raw("'ANULADO: ' || COALESCE(description, '')"), updated_at: new Date() });
  });

  const updated = await db('treasury_operations').where({ id: operationId }).first();
  await auditService.logAction(userId, 'treasury_operation', operationId, 'void', operation, updated, ip);
  return updated;
}

/**
 * List operations with filters
 */
async function listOperations({ status, from_date, to_date, supplier_id, purchase_type, page = 1, limit = 20 }) {
  const query = db('treasury_operations')
    .leftJoin('users', 'treasury_operations.created_by', 'users.id')
    .leftJoin('suppliers', 'treasury_operations.supplier_id', 'suppliers.id')
    .select(
      'treasury_operations.*',
      'users.full_name as created_by_name',
      'suppliers.business_name as supplier_business_name',
    );

  if (status && status.trim()) query.where('treasury_operations.status', status.trim());
  if (from_date && from_date.trim()) query.where('treasury_operations.operation_date', '>=', from_date.trim());
  if (to_date && to_date.trim()) query.where('treasury_operations.operation_date', '<=', to_date.trim());
  if (supplier_id && supplier_id.trim()) query.where('treasury_operations.supplier_id', supplier_id.trim());
  if (purchase_type && purchase_type.trim()) query.where('treasury_operations.purchase_type', purchase_type.trim());

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
    .leftJoin('suppliers', 'treasury_operations.supplier_id', 'suppliers.id')
    .where('treasury_operations.id', id)
    .select(
      'treasury_operations.*',
      'users.full_name as created_by_name',
      'suppliers.business_name as supplier_business_name',
    )
    .first();

  if (!operation) throw new AppError('Operación no encontrada', 404);

  const ledger = await db('treasury_ledger')
    .join('internal_accounts', 'treasury_ledger.account_id', 'internal_accounts.id')
    .where('treasury_ledger.operation_id', id)
    .select('treasury_ledger.*', 'internal_accounts.name as account_name', 'internal_accounts.code as account_code')
    .orderBy('treasury_ledger.created_at');

  const bcv = parseFloat(operation.bcv_rate) || 0;
  const ves = parseFloat(operation.amount_ves) || 0;
  const usdAtBcv = bcv > 0 ? round2(ves / bcv) : 0;

  return { ...operation, usd_equivalent_bcv: usdAtBcv, ledger };
}

/**
 * Monthly summary
 */
async function getMonthlySummary(period) {
  const [month, year] = period.split('/');
  if (!month || !year) throw new AppError('Formato de período inválido, use MM/YYYY', 400);

  const startDate = `${year}-${month.padStart(2, '0')}-01`;
  const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];

  const operations = await db('treasury_operations')
    .leftJoin('suppliers', 'treasury_operations.supplier_id', 'suppliers.id')
    .where('treasury_operations.operation_date', '>=', startDate)
    .where('treasury_operations.operation_date', '<=', endDate)
    .whereNot('treasury_operations.status', 'anulada')
    .select('treasury_operations.*', 'suppliers.business_name as supplier_business_name')
    .orderBy('treasury_operations.operation_date');

  const totalVes = operations.reduce((s, o) => s + parseFloat(o.amount_ves || 0), 0);
  const totalUsd = operations.reduce((s, o) => s + parseFloat(o.amount_usd || 0), 0);
  const totalDiffVes = operations.reduce((s, o) => s + parseFloat(o.exchange_difference || 0), 0);
  const totalDiffUsd = operations.reduce((s, o) => s + parseFloat(o.diff_usd || 0), 0);

  let totalUsdAtBcv = 0;
  const enriched = operations.map((o) => {
    const bcv = parseFloat(o.bcv_rate) || 0;
    const ves = parseFloat(o.amount_ves) || 0;
    const usdBcv = bcv > 0 ? round2(ves / bcv) : 0;
    totalUsdAtBcv += usdBcv;
    return { ...o, usd_equivalent_bcv: usdBcv };
  });

  // By purchase type
  const byType = {};
  operations.forEach((o) => {
    const type = o.purchase_type || 'otro';
    if (!byType[type]) byType[type] = { count: 0, total_ves: 0, total_usd: 0, diff_usd: 0 };
    byType[type].count++;
    byType[type].total_ves += parseFloat(o.amount_ves || 0);
    byType[type].total_usd += parseFloat(o.amount_usd || 0);
    byType[type].diff_usd += parseFloat(o.diff_usd || 0);
  });

  const opsWithRate = operations.filter((o) => parseFloat(o.purchase_rate || o.parallel_rate) > 0);
  const avgPurchase = opsWithRate.length
    ? round2(opsWithRate.reduce((s, o) => s + parseFloat(o.purchase_rate || o.parallel_rate), 0) / opsWithRate.length) : 0;
  const opsWithBcv = operations.filter((o) => parseFloat(o.bcv_rate) > 0);
  const avgBcv = opsWithBcv.length
    ? round2(opsWithBcv.reduce((s, o) => s + parseFloat(o.bcv_rate), 0) / opsWithBcv.length) : 0;

  const ledgerSummary = await db('treasury_ledger')
    .join('internal_accounts', 'treasury_ledger.account_id', 'internal_accounts.id')
    .join('treasury_operations', 'treasury_ledger.operation_id', 'treasury_operations.id')
    .where('treasury_ledger.movement_date', '>=', startDate)
    .where('treasury_ledger.movement_date', '<=', endDate)
    .whereNot('treasury_operations.status', 'anulada')
    .groupBy('internal_accounts.code', 'internal_accounts.name')
    .select(
      'internal_accounts.code', 'internal_accounts.name',
      db.raw("SUM(CASE WHEN treasury_ledger.movement_type = 'debito' THEN treasury_ledger.amount ELSE 0 END) as total_debito"),
      db.raw("SUM(CASE WHEN treasury_ledger.movement_type = 'credito' THEN treasury_ledger.amount ELSE 0 END) as total_credito"),
    );

  return {
    period, start_date: startDate, end_date: endDate,
    operations_count: operations.length,
    total_ves_out: round2(totalVes),
    total_usd_in: round2(totalUsd),
    total_usd_equivalent_bcv: round2(totalUsdAtBcv),
    diff_usd: round2(totalDiffUsd),
    diff_ves: round2(totalDiffVes),
    avg_purchase_rate: avgPurchase,
    avg_bcv_rate: avgBcv,
    by_purchase_type: byType,
    account_balances: ledgerSummary,
    operations: enriched,
  };
}

async function getAccounts() {
  return db('internal_accounts').where({ is_active: true }).orderBy('code');
}

/**
 * Dashboard data for interactive charts
 */
async function getDashboardData() {
  // Current month operations
  const now = new Date();
  const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

  // Active operations (not voided)
  const allOps = await db('treasury_operations')
    .whereNot('status', 'anulada')
    .orderBy('operation_date');

  const monthOps = allOps.filter((o) => {
    const d = typeof o.operation_date === 'string' ? o.operation_date : o.operation_date.toISOString().split('T')[0];
    return d >= startOfMonth && d <= endOfMonth;
  });

  // --- KPIs ---
  const totalVes = monthOps.reduce((s, o) => s + parseFloat(o.amount_ves || 0), 0);
  const totalUsd = monthOps.reduce((s, o) => s + parseFloat(o.amount_usd || 0), 0);
  const totalDiffUsd = monthOps.reduce((s, o) => s + parseFloat(o.diff_usd || 0), 0);

  let todayBcv = 0;
  try {
    const rateData = await exchangeRateService.getTodayRate();
    if (rateData) todayBcv = parseFloat(rateData.rate);
  } catch (e) { /* */ }

  // Cash position
  const flows = await db('treasury_cash_flows').where({ status: 'activo' });
  let balanceVes = 0;
  flows.forEach((f) => {
    const ves = parseFloat(f.amount_ves) || 0;
    balanceVes += f.flow_type === 'ingreso' ? ves : -ves;
  });

  // --- Chart: VES by day (current month) ---
  const dailyMap = {};
  monthOps.forEach((o) => {
    const d = typeof o.operation_date === 'string' ? o.operation_date : o.operation_date.toISOString().split('T')[0];
    if (!dailyMap[d]) dailyMap[d] = { date: d, ves: 0, usd: 0, count: 0 };
    dailyMap[d].ves += parseFloat(o.amount_ves || 0);
    dailyMap[d].usd += parseFloat(o.amount_usd || 0);
    dailyMap[d].count++;
  });
  const daily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({
    ...d, ves: round2(d.ves), usd: round2(d.usd),
    label: `${d.date.split('-')[2]}/${d.date.split('-')[1]}`,
  }));

  // --- Chart: by purchase type ---
  const typeMap = {};
  monthOps.forEach((o) => {
    const t = o.purchase_type || 'otro';
    if (!typeMap[t]) typeMap[t] = { type: t, ves: 0, usd: 0, count: 0 };
    typeMap[t].ves += parseFloat(o.amount_ves || 0);
    typeMap[t].usd += parseFloat(o.amount_usd || 0);
    typeMap[t].count++;
  });
  const byType = Object.values(typeMap).map((d) => ({ ...d, ves: round2(d.ves), usd: round2(d.usd) }));

  // --- Chart: cumulative cash flow ---
  const flowsByDate = {};
  flows.forEach((f) => {
    const d = typeof f.flow_date === 'string' ? f.flow_date : f.flow_date.toISOString().split('T')[0];
    if (d >= startOfMonth && d <= endOfMonth) {
      if (!flowsByDate[d]) flowsByDate[d] = { date: d, ingresos: 0, egresos: 0 };
      const ves = parseFloat(f.amount_ves) || 0;
      if (f.flow_type === 'ingreso') flowsByDate[d].ingresos += ves;
      else flowsByDate[d].egresos += ves;
    }
  });
  const cashFlowDaily = Object.values(flowsByDate).sort((a, b) => a.date.localeCompare(b.date));
  let cumBal = 0;
  // Get starting balance (flows before this month)
  flows.forEach((f) => {
    const d = typeof f.flow_date === 'string' ? f.flow_date : f.flow_date.toISOString().split('T')[0];
    if (d < startOfMonth) {
      const ves = parseFloat(f.amount_ves) || 0;
      cumBal += f.flow_type === 'ingreso' ? ves : -ves;
    }
  });
  const cashFlowChart = cashFlowDaily.map((d) => {
    cumBal += d.ingresos - d.egresos;
    return {
      ...d,
      label: `${d.date.split('-')[2]}/${d.date.split('-')[1]}`,
      ingresos: round2(d.ingresos),
      egresos: round2(d.egresos),
      saldo: round2(cumBal),
    };
  });

  // --- Chart: diff USD per operation (gain/loss scatter) ---
  const diffChart = monthOps.map((o) => ({
    date: typeof o.operation_date === 'string' ? o.operation_date : o.operation_date.toISOString().split('T')[0],
    diff_usd: parseFloat(o.diff_usd || 0),
    amount_ves: parseFloat(o.amount_ves || 0),
    type: o.purchase_type || 'otro',
  }));

  // --- Top suppliers ---
  const supplierMap = {};
  monthOps.forEach((o) => {
    const name = o.supplier_name || 'Sin proveedor';
    if (!supplierMap[name]) supplierMap[name] = { name, ves: 0, usd: 0, count: 0 };
    supplierMap[name].ves += parseFloat(o.amount_ves || 0);
    supplierMap[name].usd += parseFloat(o.amount_usd || 0);
    supplierMap[name].count++;
  });
  const topSuppliers = Object.values(supplierMap)
    .sort((a, b) => b.ves - a.ves)
    .slice(0, 5)
    .map((s) => ({ ...s, ves: round2(s.ves), usd: round2(s.usd) }));

  // --- Average rates ---
  const opsWithRate = monthOps.filter((o) => parseFloat(o.purchase_rate || o.parallel_rate) > 0);
  const avgPurchase = opsWithRate.length
    ? round2(opsWithRate.reduce((s, o) => s + parseFloat(o.purchase_rate || o.parallel_rate), 0) / opsWithRate.length) : 0;
  const opsWithBcv = monthOps.filter((o) => parseFloat(o.bcv_rate) > 0);
  const avgBcv = opsWithBcv.length
    ? round2(opsWithBcv.reduce((s, o) => s + parseFloat(o.bcv_rate), 0) / opsWithBcv.length) : 0;

  return {
    period: `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`,
    kpis: {
      operations_count: monthOps.length,
      total_ves: round2(totalVes),
      total_usd: round2(totalUsd),
      diff_usd: round2(totalDiffUsd),
      balance_ves: round2(balanceVes),
      balance_usd: todayBcv > 0 ? round2(balanceVes / todayBcv) : 0,
      today_bcv_rate: todayBcv,
      avg_purchase_rate: avgPurchase,
      avg_bcv_rate: avgBcv,
      spread_pct: avgBcv > 0 ? round2(((avgPurchase - avgBcv) / avgBcv) * 100) : 0,
    },
    charts: {
      daily,
      by_type: byType,
      cash_flow: cashFlowChart,
      diff_scatter: diffChart,
    },
    top_suppliers: topSuppliers,
  };
}

// ─── Cash Flow / Posición Cambiaria ───

/**
 * Record a manual VES entry or exit
 */
async function recordCashFlow(data, userId, ip) {
  const { flow_date, flow_type, amount_ves, bcv_rate, description } = data;

  if (!flow_date || !flow_type || !amount_ves || !bcv_rate) {
    throw new AppError('Fecha, tipo, monto VES y tasa BCV son requeridos', 400);
  }

  const ves = parseFloat(amount_ves);
  const bcv = parseFloat(bcv_rate);
  if (ves <= 0 || bcv <= 0) throw new AppError('Monto y tasa deben ser mayores a 0', 400);
  if (!['ingreso', 'egreso'].includes(flow_type)) throw new AppError('Tipo debe ser ingreso o egreso', 400);

  const usdEquiv = round2(ves / bcv);

  const [flow] = await db('treasury_cash_flows').insert({
    flow_date,
    flow_type,
    amount_ves: ves,
    bcv_rate: bcv,
    usd_equivalent: usdEquiv,
    description: description || null,
    reference_type: 'manual',
    created_by: userId,
  }).returning('*');

  await auditService.logAction(userId, 'treasury_cash_flow', flow.id, 'create', null, flow, ip);
  return flow;
}

/**
 * Get current cash position with revaluation at today's BCV
 */
async function getCashPosition() {
  const flows = await db('treasury_cash_flows')
    .where({ status: 'activo' })
    .orderBy('flow_date', 'desc');

  // Current balance
  let balanceVes = 0;
  let totalInVes = 0;
  let totalOutVes = 0;
  let totalInUsdAtEntry = 0;
  let totalOutUsdAtEntry = 0;

  flows.forEach((f) => {
    const ves = parseFloat(f.amount_ves) || 0;
    const usd = parseFloat(f.usd_equivalent) || 0;
    if (f.flow_type === 'ingreso') {
      balanceVes += ves;
      totalInVes += ves;
      totalInUsdAtEntry += usd;
    } else {
      balanceVes -= ves;
      totalOutVes += ves;
      totalOutUsdAtEntry += usd;
    }
  });

  // Get today's BCV rate for revaluation
  let todayBcv = 0;
  try {
    const rateData = await exchangeRateService.getTodayRate();
    if (rateData) todayBcv = parseFloat(rateData.rate);
  } catch (e) { /* no rate available */ }

  const balanceUsdToday = todayBcv > 0 ? round2(balanceVes / todayBcv) : 0;
  const balanceUsdAtEntry = round2(totalInUsdAtEntry - totalOutUsdAtEntry);

  // Revaluation: difference between USD value at entry vs USD value today
  const revaluationUsd = todayBcv > 0 ? round2(balanceUsdToday - balanceUsdAtEntry) : 0;

  return {
    balance_ves: round2(balanceVes),
    balance_usd_at_entry: balanceUsdAtEntry,
    balance_usd_today: balanceUsdToday,
    revaluation_usd: revaluationUsd,
    today_bcv_rate: todayBcv,
    total_ingresos_ves: round2(totalInVes),
    total_egresos_ves: round2(totalOutVes),
    total_ingresos_usd_entry: round2(totalInUsdAtEntry),
    total_egresos_usd_entry: round2(totalOutUsdAtEntry),
    movements_count: flows.length,
  };
}

/**
 * List cash flow movements with filters
 */
async function listCashFlows({ flow_type, from_date, to_date, page = 1, limit = 20 }) {
  const query = db('treasury_cash_flows')
    .leftJoin('users', 'treasury_cash_flows.created_by', 'users.id')
    .where('treasury_cash_flows.status', 'activo')
    .select(
      'treasury_cash_flows.*',
      'users.full_name as created_by_name',
    );

  if (flow_type && flow_type.trim()) query.where('treasury_cash_flows.flow_type', flow_type.trim());
  if (from_date && from_date.trim()) query.where('treasury_cash_flows.flow_date', '>=', from_date.trim());
  if (to_date && to_date.trim()) query.where('treasury_cash_flows.flow_date', '<=', to_date.trim());

  const [{ count }] = await query.clone().count();
  const data = await query.orderBy('treasury_cash_flows.flow_date', 'desc').limit(limit).offset((page - 1) * limit);

  // Enrich with running balance
  let todayBcv = 0;
  try {
    const rateData = await exchangeRateService.getTodayRate();
    if (rateData) todayBcv = parseFloat(rateData.rate);
  } catch (e) { /* no rate */ }

  const enriched = data.map((f) => {
    const ves = parseFloat(f.amount_ves) || 0;
    const usdToday = todayBcv > 0 ? round2(ves / todayBcv) : 0;
    return { ...f, usd_today: usdToday, today_bcv_rate: todayBcv };
  });

  return { data: enriched, pagination: { total: parseInt(count), page: parseInt(page), limit: parseInt(limit) } };
}

/**
 * Void a cash flow entry
 */
async function voidCashFlow(flowId, reason, userId, ip) {
  const flow = await db('treasury_cash_flows').where({ id: flowId }).first();
  if (!flow) throw new AppError('Movimiento no encontrado', 404);
  if (flow.status === 'anulado') throw new AppError('Ya está anulado', 400);

  const [updated] = await db('treasury_cash_flows').where({ id: flowId }).update({
    status: 'anulado',
    description: `ANULADO: ${reason}. ${flow.description || ''}`,
    updated_at: new Date(),
  }).returning('*');

  await auditService.logAction(userId, 'treasury_cash_flow', flowId, 'void', flow, updated, ip);
  return updated;
}

/**
 * Revaluation report: compares VES balance value at different dates.
 * Uses exchange_rates table first; if empty, falls back to the BCV rates
 * recorded inside each cash flow movement.
 */
async function getRevaluationReport(fromDate, toDate) {
  if (!fromDate || !toDate) throw new AppError('Fechas desde y hasta son requeridas', 400);

  // Get all active flows up to toDate
  const flows = await db('treasury_cash_flows')
    .where({ status: 'activo' })
    .where('flow_date', '<=', toDate)
    .orderBy('flow_date');

  // Build a date→rate map from both sources
  const rateMap = new Map(); // date string → bcv rate

  // Source 1: exchange_rates table
  const rates = await exchangeRateService.getRateRange(fromDate, toDate);
  rates.forEach((r) => {
    const d = typeof r.rate_date === 'string' ? r.rate_date : r.rate_date.toISOString().split('T')[0];
    const val = parseFloat(r.rate);
    if (val > 0) rateMap.set(d, val);
  });

  // Source 2: BCV rates stored in each cash flow (fills gaps)
  flows.forEach((f) => {
    const d = typeof f.flow_date === 'string' ? f.flow_date : f.flow_date.toISOString().split('T')[0];
    if (d >= fromDate && d <= toDate && !rateMap.has(d)) {
      const val = parseFloat(f.bcv_rate);
      if (val > 0) rateMap.set(d, val);
    }
  });

  // Sort dates
  const sortedDates = [...rateMap.keys()].sort();

  // Calculate balance at each rate date
  const snapshots = sortedDates.map((rateDate) => {
    const bcv = rateMap.get(rateDate);
    let balVes = 0;
    flows.forEach((f) => {
      const fDate = typeof f.flow_date === 'string' ? f.flow_date : f.flow_date.toISOString().split('T')[0];
      if (fDate <= rateDate) {
        const ves = parseFloat(f.amount_ves) || 0;
        balVes += f.flow_type === 'ingreso' ? ves : -ves;
      }
    });
    return {
      date: rateDate,
      bcv_rate: bcv,
      balance_ves: round2(balVes),
      balance_usd: bcv > 0 ? round2(balVes / bcv) : 0,
    };
  });

  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];
  const changeUsd = first && last ? round2(last.balance_usd - first.balance_usd) : 0;

  return {
    from_date: fromDate,
    to_date: toDate,
    snapshots,
    change_usd: changeUsd,
    first_snapshot: first || null,
    last_snapshot: last || null,
  };
}

/**
 * Repair: create missing cash flows for operations that were
 * created before the transaction fix (orphaned operations).
 */
async function repairMissingCashFlows(userId) {
  // Find operations that have NO cash flow record at all (active or voided)
  const ops = await db('treasury_operations')
    .leftJoin('treasury_cash_flows', function () {
      this.on('treasury_cash_flows.reference_id', '=', 'treasury_operations.id')
        .andOn('treasury_cash_flows.reference_type', '=', db.raw("'treasury_operation'"));
    })
    .whereNull('treasury_cash_flows.id')
    .where('treasury_operations.status', 'completada')
    .select('treasury_operations.*');

  if (!ops.length) return { repaired: 0, operations: [] };

  const entries = ops.map((op) => {
    const ves = parseFloat(op.amount_ves) || 0;
    const bcv = parseFloat(op.bcv_rate) || 0;
    const usdAtBcv = bcv > 0 ? round2(ves / bcv) : 0;
    const pRate = parseFloat(op.purchase_rate || op.parallel_rate) || 0;
    const amountUsd = pRate > 0 ? round2(ves / pRate) : 0;
    const purchaseLabel = op.purchase_type ? op.purchase_type.charAt(0).toUpperCase() + op.purchase_type.slice(1) : 'Compra';
    return {
      flow_date: op.operation_date,
      flow_type: 'egreso',
      amount_ves: ves,
      bcv_rate: bcv,
      usd_equivalent: usdAtBcv,
      description: `[Reparado] Compra ${purchaseLabel}: ${amountUsd} USD a tasa ${pRate}`,
      reference_type: 'treasury_operation',
      reference_id: op.id,
      created_by: userId,
    };
  });

  await db('treasury_cash_flows').insert(entries);
  return { repaired: ops.length, operations: ops.map((o) => ({ id: o.id, date: o.operation_date, amount_ves: o.amount_ves })) };
}

/**
 * Reset all treasury data and create 10 sample movements.
 * Uses today's real BCV rate from exchange_rates table.
 */
async function resetAndSeedDemo(userId) {
  // Get current BCV rate
  const todayRate = await exchangeRateService.getTodayRate();
  const bcv = todayRate ? parseFloat(todayRate.rate) : 0;
  if (bcv <= 0) throw new AppError('No hay tasa BCV disponible. Ve a Tasas de Cambio y obtén la tasa primero.', 400);

  await db.transaction(async (trx) => {
    // Clean all treasury data
    await trx('treasury_cash_flows').del();
    await trx('treasury_ledger').del();
    await trx('treasury_operations').del();

    // Get internal accounts
    const accounts = await trx('internal_accounts')
      .whereIn('code', ['PREST_ACC', 'BANCO_VES', 'BANCO_USD', 'CAJA_USD', 'GAN_CAMB', 'PERD_CAMB']);
    const getAcc = (code) => accounts.find((a) => a.code === code);

    // Helper to create a complete operation with ledger + cash flow
    const createOp = async (opData) => {
      const ves = opData.amount_ves;
      const pRate = opData.purchase_rate;
      const opBcv = opData.bcv_rate;
      const amountUsd = round2(ves / pRate);
      const usdAtBcv = round2(ves / opBcv);
      const diffUsd = round2(amountUsd - usdAtBcv);
      const diffVes = round2(diffUsd * opBcv);
      const destCode = opData.destination_type === 'caja_usd' ? 'CAJA_USD' : 'BANCO_USD';
      const purchaseLabel = opData.purchase_type.charAt(0).toUpperCase() + opData.purchase_type.slice(1);

      const [op] = await trx('treasury_operations').insert({
        operation_date: opData.date,
        description: opData.description,
        purchase_type: opData.purchase_type,
        amount_ves: ves,
        amount_usd: amountUsd,
        parallel_rate: pRate,
        purchase_rate: pRate,
        bcv_rate: opBcv,
        destination_type: opData.destination_type || 'banco_usd',
        exchange_difference: diffVes,
        diff_usd: diffUsd,
        supplier_name: opData.supplier_name || null,
        status: 'completada',
        created_by: userId,
      }).returning('*');

      const ledger = [
        { operation_id: op.id, account_id: getAcc('PREST_ACC').id, movement_type: 'debito', amount: ves, currency: 'VES', description: `Salida VES - ${purchaseLabel}`, movement_date: opData.date },
        { operation_id: op.id, account_id: getAcc('BANCO_VES').id, movement_type: 'credito', amount: ves, currency: 'VES', description: 'Salida banco VES', movement_date: opData.date },
        { operation_id: op.id, account_id: getAcc(destCode).id, movement_type: 'debito', amount: amountUsd, currency: 'USD', description: `Ingreso ${amountUsd} USD (${purchaseLabel} a tasa ${pRate})`, movement_date: opData.date },
        { operation_id: op.id, account_id: getAcc('PREST_ACC').id, movement_type: 'credito', amount: ves, currency: 'VES', description: 'Liquidación préstamo accionista', movement_date: opData.date },
      ];
      if (diffVes !== 0) {
        const isGain = diffVes > 0;
        ledger.push({
          operation_id: op.id, account_id: getAcc(isGain ? 'GAN_CAMB' : 'PERD_CAMB').id,
          movement_type: isGain ? 'credito' : 'debito',
          amount: Math.abs(diffVes), currency: 'VES',
          description: `${isGain ? 'Ganancia' : 'Pérdida'}: ${Math.abs(diffUsd)} USD`,
          movement_date: opData.date,
        });
      }
      await trx('treasury_ledger').insert(ledger);

      await trx('treasury_cash_flows').insert({
        flow_date: opData.date,
        flow_type: 'egreso',
        amount_ves: ves,
        bcv_rate: opBcv,
        usd_equivalent: usdAtBcv,
        description: `Compra ${purchaseLabel}: ${amountUsd} USD a tasa ${pRate}`,
        reference_type: 'treasury_operation',
        reference_id: op.id,
        created_by: userId,
      });

      return op;
    };

    // Build 10 demo operations using today's real BCV rate
    const spread = bcv * 0.20; // ~20% spread for parallel rate
    const parallelRate = round2(bcv + spread);

    const demoOps = [
      { date: '2026-03-01', amount_ves: 500000, purchase_rate: parallelRate, bcv_rate: bcv, purchase_type: 'efectivo', description: 'Compra USD efectivo - Proveedor A', supplier_name: 'Proveedor A', destination_type: 'banco_usd' },
      { date: '2026-03-01', amount_ves: 1200000, purchase_rate: round2(parallelRate - 5), bcv_rate: bcv, purchase_type: 'zelle', description: 'Pago Zelle proveedor exterior', supplier_name: 'Travel Corp', destination_type: 'banco_usd' },
      { date: '2026-03-02', amount_ves: 750000, purchase_rate: parallelRate, bcv_rate: bcv, purchase_type: 'binance', description: 'Compra USDT para pago sistema', supplier_name: 'Tech Solutions', destination_type: 'banco_usd' },
      { date: '2026-03-02', amount_ves: 300000, purchase_rate: round2(parallelRate + 3), bcv_rate: bcv, purchase_type: 'efectivo', description: 'USD cash para viáticos', supplier_name: null, destination_type: 'caja_usd' },
      { date: '2026-03-03', amount_ves: 2000000, purchase_rate: round2(parallelRate - 2), bcv_rate: bcv, purchase_type: 'zelle', description: 'Pago proveedor GDS mensual', supplier_name: 'Amadeus IT', destination_type: 'banco_usd' },
      { date: '2026-03-03', amount_ves: 450000, purchase_rate: parallelRate, bcv_rate: bcv, purchase_type: 'paypal', description: 'Suscripción software mensual', supplier_name: 'SaaS Provider', destination_type: 'banco_usd' },
      { date: '2026-03-03', amount_ves: 800000, purchase_rate: round2(parallelRate + 1), bcv_rate: bcv, purchase_type: 'transferencia_usd', description: 'Transferencia USD a cuenta Miami', supplier_name: null, destination_type: 'banco_usd' },
      { date: '2026-03-04', amount_ves: 1500000, purchase_rate: round2(parallelRate - 3), bcv_rate: bcv, purchase_type: 'binance', description: 'Compra USDT para pago hosting', supplier_name: 'AWS', destination_type: 'banco_usd' },
      { date: '2026-03-04', amount_ves: 350000, purchase_rate: parallelRate, bcv_rate: bcv, purchase_type: 'efectivo', description: 'USD efectivo para caja chica', supplier_name: null, destination_type: 'caja_usd' },
      { date: '2026-03-04', amount_ves: 950000, purchase_rate: round2(parallelRate + 2), bcv_rate: bcv, purchase_type: 'zelle', description: 'Pago boleto aéreo cliente', supplier_name: 'Airline Partner', destination_type: 'banco_usd' },
    ];

    for (const opData of demoOps) {
      await createOp(opData);
    }

    // Also create 3 manual cash flow entries (ingresos) to show VES entering
    const manualFlows = [
      { flow_date: '2026-03-01', flow_type: 'ingreso', amount_ves: 5000000, bcv_rate: bcv, description: 'Aporte accionista para operaciones del mes' },
      { flow_date: '2026-03-02', flow_type: 'ingreso', amount_ves: 3000000, bcv_rate: bcv, description: 'Cobro clientes - pagos pendientes' },
      { flow_date: '2026-03-04', flow_type: 'ingreso', amount_ves: 2000000, bcv_rate: bcv, description: 'Transferencia desde cuenta reserva' },
    ];

    for (const mf of manualFlows) {
      await trx('treasury_cash_flows').insert({
        ...mf,
        usd_equivalent: round2(mf.amount_ves / mf.bcv_rate),
        reference_type: 'manual',
        created_by: userId,
      });
    }

    // Store BCV rates for the demo date range so revaluation works
    const demoDates = ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04'];
    for (const d of demoDates) {
      const existing = await trx('exchange_rates').where({ rate_date: d }).first();
      if (!existing) {
        await trx('exchange_rates').insert({ rate_date: d, rate: bcv, source: 'bcv_api' });
      }
    }
  });

  return { message: 'Data limpiada. 10 operaciones + 3 ingresos manuales creados.', bcv_rate_used: bcv };
}

module.exports = {
  createOperation,
  voidOperation,
  listOperations,
  getOperationById,
  getMonthlySummary,
  getAccounts,
  getDashboardData,
  recordCashFlow,
  getCashPosition,
  listCashFlows,
  voidCashFlow,
  getRevaluationReport,
  repairMissingCashFlows,
  resetAndSeedDemo,
};
