const db = require('../database/connection');
const { round2 } = require('../utils/helpers');
const { AppError } = require('../middleware/errorHandler');
const auditService = require('./auditService');
const exchangeRateService = require('./exchangeRateService');

const INTERNAL_ACCOUNTS_SEED = [
  { code: 'BANCO_VES', name: 'Banco VES (Salida)', type: 'activo', currency: 'VES' },
  { code: 'BANCO_USD', name: 'Banco USD (Entrada)', type: 'activo', currency: 'USD' },
  { code: 'CAJA_USD', name: 'Caja USD', type: 'activo', currency: 'USD' },
  { code: 'PREST_ACC', name: 'Préstamos Accionistas', type: 'pasivo', currency: 'VES' },
  { code: 'GAN_CAMB', name: 'Ganancia Cambiaria', type: 'ingreso', currency: 'VES' },
  { code: 'PERD_CAMB', name: 'Pérdida Cambiaria', type: 'gasto', currency: 'VES' },
];

async function ensureInternalAccounts() {
  const existing = await db('internal_accounts').select('code');
  const existingCodes = existing.map((a) => a.code);
  const missing = INTERNAL_ACCOUNTS_SEED.filter((a) => !existingCodes.includes(a.code));
  if (missing.length > 0) {
    await db('internal_accounts').insert(missing);
  }
}

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

    // Ensure internal accounts exist (auto-seed if missing)
    await ensureInternalAccounts();

    // Ledger entries
    const accounts = await trx('internal_accounts')
      .whereIn('code', ['PREST_ACC', 'BANCO_VES', 'BANCO_USD', 'CAJA_USD', 'GAN_CAMB', 'PERD_CAMB']);
    const getAcc = (code) => {
      const acc = accounts.find((a) => a.code === code);
      if (!acc) throw new AppError(`Cuenta interna "${code}" no encontrada.`, 500);
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

  const [{ count }] = await query.clone().clear('select').count('* as count');
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
  let totalIngresosVes = 0;
  let totalEgresosVes = 0;
  let monthIngresosVes = 0;
  let monthEgresosVes = 0;
  let monthFlowCount = 0;
  flows.forEach((f) => {
    const ves = parseFloat(f.amount_ves) || 0;
    const d = typeof f.flow_date === 'string' ? f.flow_date : f.flow_date.toISOString().split('T')[0];
    if (f.flow_type === 'ingreso') {
      balanceVes += ves;
      totalIngresosVes += ves;
      if (d >= startOfMonth && d <= endOfMonth) { monthIngresosVes += ves; monthFlowCount++; }
    } else {
      balanceVes -= ves;
      totalEgresosVes += ves;
      if (d >= startOfMonth && d <= endOfMonth) { monthEgresosVes += ves; monthFlowCount++; }
    }
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

  // --- Chart: VES flow by type (ingreso vs egreso) for donut ---
  const flowTypeMap = {};
  flows.forEach((f) => {
    const d = typeof f.flow_date === 'string' ? f.flow_date : f.flow_date.toISOString().split('T')[0];
    if (d >= startOfMonth && d <= endOfMonth) {
      const desc = f.description || (f.flow_type === 'ingreso' ? 'Ingreso' : 'Egreso');
      const key = f.reference_type === 'treasury_operation' ? 'Compra Divisas'
        : f.flow_type === 'ingreso' ? (desc.length > 25 ? desc.substring(0, 25) : desc)
        : (desc.length > 25 ? desc.substring(0, 25) : desc);
      const cat = f.flow_type === 'ingreso' ? `↑ ${key}` : `↓ ${key}`;
      if (!flowTypeMap[cat]) flowTypeMap[cat] = { type: cat, ves: 0, count: 0, flow_type: f.flow_type };
      flowTypeMap[cat].ves += parseFloat(f.amount_ves) || 0;
      flowTypeMap[cat].count++;
    }
  });
  const flowByType = Object.values(flowTypeMap).map((d) => ({ ...d, ves: round2(Math.abs(d.ves)) }));

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
    // New: VES position KPIs
    position: {
      month_ingresos_ves: round2(monthIngresosVes),
      month_egresos_ves: round2(monthEgresosVes),
      month_neto_ves: round2(monthIngresosVes - monthEgresosVes),
      month_flow_count: monthFlowCount,
      total_ingresos_ves: round2(totalIngresosVes),
      total_egresos_ves: round2(totalEgresosVes),
      balance_ves: round2(balanceVes),
      balance_usd_equiv: todayBcv > 0 ? round2(balanceVes / todayBcv) : 0,
    },
    charts: {
      daily,
      by_type: byType,
      cash_flow: cashFlowChart,
      diff_scatter: diffChart,
      flow_by_type: flowByType,
    },
    top_suppliers: topSuppliers,
  };
}

// ─── Cash Flow / Posición Cambiaria ───

/**
 * Record a manual VES/USD entry or exit
 *
 * currency_mode:
 *  - 'usd': User enters amount in USD. No rate conversion needed, VES = amount_usd * bcv_rate
 *  - 'ves': User enters amount in VES. BCV rate used to calculate USD equivalent.
 *  - 'custom': User enters amount in USD + custom rate to calculate VES.
 */
async function recordCashFlow(data, userId, ip) {
  const { flow_date, flow_type, amount_usd, amount_ves, bcv_rate, custom_rate, currency_mode, description, bank_account_id } = data;

  if (!flow_date || !flow_type) {
    throw new AppError('Fecha y tipo son requeridos', 400);
  }
  if (!['ingreso', 'egreso'].includes(flow_type)) throw new AppError('Tipo debe ser ingreso o egreso', 400);

  const mode = currency_mode || 'ves';
  let ves, bcv, usdEquiv;

  if (mode === 'usd') {
    // Amount is in USD, no rate conversion needed for the USD side
    const usd = parseFloat(amount_usd);
    if (!usd || usd <= 0) throw new AppError('Ingrese monto USD válido', 400);
    bcv = parseFloat(bcv_rate) || 0;
    // VES equivalent at BCV (for reference)
    ves = bcv > 0 ? round2(usd * bcv) : 0;
    usdEquiv = round2(usd);
  } else if (mode === 'custom') {
    // Amount in USD + custom rate to get VES
    const usd = parseFloat(amount_usd);
    const cRate = parseFloat(custom_rate);
    if (!usd || usd <= 0) throw new AppError('Ingrese monto USD válido', 400);
    if (!cRate || cRate <= 0) throw new AppError('Ingrese tasa personalizada válida', 400);
    bcv = parseFloat(bcv_rate) || 0;
    ves = round2(usd * cRate);
    usdEquiv = round2(usd);
  } else {
    // mode === 'ves' (original behavior)
    ves = parseFloat(amount_ves);
    bcv = parseFloat(bcv_rate);
    if (!ves || ves <= 0) throw new AppError('Ingrese monto VES válido', 400);
    if (!bcv || bcv <= 0) throw new AppError('La tasa BCV es requerida', 400);
    usdEquiv = round2(ves / bcv);
  }

  // Also create a bank_movement if bank_account_id is provided
  if (bank_account_id) {
    const account = await db('bank_accounts').where({ id: bank_account_id }).first();
    if (account) {
      await db('bank_movements').insert({
        bank_account_id,
        movement_date: flow_date,
        description: description || (flow_type === 'ingreso' ? 'Ingreso tesorería' : 'Egreso tesorería'),
        debit: flow_type === 'egreso' ? ves : 0,
        credit: flow_type === 'ingreso' ? ves : 0,
        reconciliation_status: 'conciliado',
      });
      // Update current_balance
      const balDelta = flow_type === 'ingreso' ? ves : -ves;
      await db('bank_accounts').where({ id: bank_account_id }).update({
        current_balance: db.raw(`current_balance + ${balDelta}`),
        updated_at: new Date(),
      });
    }
  }

  const [flow] = await db('treasury_cash_flows').insert({
    flow_date,
    flow_type,
    bank_account_id: bank_account_id || null,
    amount_ves: ves || 0,
    bcv_rate: bcv || 0,
    usd_equivalent: usdEquiv,
    description: description || null,
    reference_type: 'manual',
    status: 'activo',
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

  const [{ count }] = await query.clone().clear('select').count('* as count');
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

    // Ensure internal accounts exist (auto-seed if missing)
    await ensureInternalAccounts();

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

/**
 * Clean all treasury data (no seeding). Returns empty state.
 */
async function cleanAllData() {
  await db.transaction(async (trx) => {
    await trx('treasury_cash_flows').del();
    await trx('treasury_ledger').del();
    await trx('treasury_operations').del();
  });
  return { message: 'Toda la data de tesorería ha sido eliminada.' };
}

/**
 * Detect recent bank outflows that might need to be classified
 * as gain/loss operations. Looks at cash flow egresos from
 * the last 7 days that are manual (not from treasury operations).
 */
async function detectOutflows() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const fromDate = sevenDaysAgo.toISOString().split('T')[0];

  // Count today's egresos (manual ones, not auto-created from operations)
  const todayStr = new Date().toISOString().split('T')[0];
  const todayEgresos = await db('treasury_cash_flows')
    .where({ status: 'activo', flow_type: 'egreso', reference_type: 'manual' })
    .where('flow_date', '=', todayStr)
    .count('id as count')
    .first();

  // Count today's ingresos (manual)
  const todayIngresos = await db('treasury_cash_flows')
    .where({ status: 'activo', flow_type: 'ingreso', reference_type: 'manual' })
    .where('flow_date', '=', todayStr)
    .count('id as count')
    .first();

  // Recent unclassified manual egresos (could be purchases)
  const recentManualEgresos = await db('treasury_cash_flows')
    .where({ status: 'activo', flow_type: 'egreso', reference_type: 'manual' })
    .where('flow_date', '>=', fromDate)
    .orderBy('flow_date', 'desc')
    .select('*');

  // Recent manual ingresos (could be sales with gain/loss)
  const recentManualIngresos = await db('treasury_cash_flows')
    .where({ status: 'activo', flow_type: 'ingreso', reference_type: 'manual' })
    .where('flow_date', '>=', fromDate)
    .orderBy('flow_date', 'desc')
    .select('*');

  // Recent operations count for context
  const recentOpsCount = await db('treasury_operations')
    .where('operation_date', '>=', fromDate)
    .whereNot('status', 'anulada')
    .count('id as count')
    .first();

  // Get today's BCV rate
  let todayBcv = 0;
  try {
    const rateData = await exchangeRateService.getTodayRate();
    if (rateData) todayBcv = parseFloat(rateData.rate);
  } catch (e) { /* */ }

  return {
    today_egresos_count: parseInt(todayEgresos?.count || 0),
    today_ingresos_count: parseInt(todayIngresos?.count || 0),
    recent_manual_egresos: recentManualEgresos,
    recent_manual_ingresos: recentManualIngresos,
    recent_operations_count: parseInt(recentOpsCount?.count || 0),
    today_bcv_rate: todayBcv,
  };
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
  cleanAllData,
  detectOutflows,
  seedTestBankData,
};

/**
 * Seed realistic test data: bank accounts, movements, treasury operations, cash flows
 * Simulates WEFLY2022 scenario with ticket sales + USD purchases
 */
async function seedTestBankData(userId) {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0];
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0];
  const fourDaysAgo = new Date(Date.now() - 4 * 86400000).toISOString().split('T')[0];

  const results = { bank_accounts: 0, bank_movements: 0, cash_flows: 0, operations: 0, exchange_rates: 0 };

  // ─── 1. Ensure bank accounts ───
  async function ensureBank(name, type, number, currency) {
    let acc = await db('bank_accounts').where({ account_number: number }).first();
    if (!acc) {
      [acc] = await db('bank_accounts').insert({ bank_name: name, account_type: type, account_number: number, currency, initial_balance: 0, current_balance: 0 }).returning('*');
      results.bank_accounts++;
    }
    return acc;
  }

  const bfc = await ensureBank('BFC Banco Fondo Comun', 'corriente', '0151-0001-00-0000001', 'VES');
  const chase = await ensureBank('Chase Bank', 'corriente', 'CHASE-USD-001', 'USD');
  await ensureBank('PNC Bank', 'corriente', 'PNC-USD-001', 'USD');

  const BCV = 431.01;
  const BINANCE = 629.00;

  // ─── 2. Bank movements ───
  const movs = [
    { bank_account_id: bfc.id, movement_date: fourDaysAgo, reference: 'PM-20260302-001', description: 'Pago boleto CCS-MIA - Rodriguez', debit: 0, credit: 314500, reconciliation_status: 'pendiente' },
    { bank_account_id: bfc.id, movement_date: threeDaysAgo, reference: 'PM-20260303-001', description: 'Pago boleto CCS-BOG - Martinez', debit: 0, credit: 188700, reconciliation_status: 'pendiente' },
    { bank_account_id: bfc.id, movement_date: twoDaysAgo, reference: 'PM-20260304-001', description: 'Pago boleto CCS-PTY - Lopez', debit: 0, credit: 440300, reconciliation_status: 'pendiente' },
    { bank_account_id: bfc.id, movement_date: twoDaysAgo, reference: 'TR-20260304-002', description: 'Pago 2 boletos CCS-SCL - Grupo Empresarial', debit: 0, credit: 881000, reconciliation_status: 'pendiente' },
    { bank_account_id: bfc.id, movement_date: yesterday, reference: 'PM-20260305-001', description: 'Pago boleto CCS-LIM - Fernandez', debit: 0, credit: 251600, reconciliation_status: 'pendiente' },
    { bank_account_id: bfc.id, movement_date: yesterday, reference: 'COMP-USD-001', description: 'Compra USD - Transferencia cambista', debit: 500000, credit: 0, reconciliation_status: 'pendiente' },
    { bank_account_id: bfc.id, movement_date: today, reference: 'PM-20260306-001', description: 'Pago boleto CCS-MDE - Gomez', debit: 0, credit: 125800, reconciliation_status: 'pendiente' },
    { bank_account_id: bfc.id, movement_date: today, reference: 'COMP-USD-002', description: 'Compra USD - Pago movil cambista', debit: 300000, credit: 0, reconciliation_status: 'pendiente' },
    { bank_account_id: chase.id, movement_date: yesterday, reference: 'ZELLE-001', description: 'Zelle - USD cambista (500K VES)', debit: 0, credit: 794.91, reconciliation_status: 'pendiente' },
    { bank_account_id: chase.id, movement_date: today, reference: 'ZELLE-002', description: 'Zelle - USD cambista (300K VES)', debit: 0, credit: 476.95, reconciliation_status: 'pendiente' },
    { bank_account_id: chase.id, movement_date: twoDaysAgo, reference: 'WIRE-KIU-001', description: 'Pago aerolinea KIU - Liquidacion semanal', debit: 2500, credit: 0, reconciliation_status: 'pendiente' },
  ];
  for (const m of movs) {
    const exists = await db('bank_movements').where({ reference: m.reference, bank_account_id: m.bank_account_id }).first();
    if (!exists) { await db('bank_movements').insert(m); results.bank_movements++; }
  }
  await db('bank_accounts').where({ id: bfc.id }).update({ current_balance: 1401900 });
  await db('bank_accounts').where({ id: chase.id }).update({ current_balance: round2(1271.86 - 2500) });

  // ─── 3. Cash flows (ticket income) ───
  const flows = [
    { flow_date: fourDaysAgo, flow_type: 'ingreso', amount_ves: 314500, bcv_rate: BCV, usd_equivalent: round2(314500 / BINANCE), description: 'Boleto CCS-MIA - Rodriguez (tasa Binance 629)', reference_type: 'manual', status: 'activo', created_by: userId, bank_account_id: bfc.id },
    { flow_date: threeDaysAgo, flow_type: 'ingreso', amount_ves: 188700, bcv_rate: BCV, usd_equivalent: round2(188700 / BINANCE), description: 'Boleto CCS-BOG - Martinez (tasa Binance 629)', reference_type: 'manual', status: 'activo', created_by: userId, bank_account_id: bfc.id },
    { flow_date: twoDaysAgo, flow_type: 'ingreso', amount_ves: 440300, bcv_rate: BCV, usd_equivalent: round2(440300 / BINANCE), description: 'Boleto CCS-PTY - Lopez (tasa Binance 629)', reference_type: 'manual', status: 'activo', created_by: userId, bank_account_id: bfc.id },
    { flow_date: twoDaysAgo, flow_type: 'ingreso', amount_ves: 881000, bcv_rate: BCV, usd_equivalent: round2(881000 / BINANCE), description: '2 Boletos CCS-SCL - Grupo Empresarial (tasa Binance 629)', reference_type: 'manual', status: 'activo', created_by: userId, bank_account_id: bfc.id },
    { flow_date: yesterday, flow_type: 'ingreso', amount_ves: 251600, bcv_rate: BCV, usd_equivalent: round2(251600 / BINANCE), description: 'Boleto CCS-LIM - Fernandez (tasa Binance 629)', reference_type: 'manual', status: 'activo', created_by: userId, bank_account_id: bfc.id },
    { flow_date: today, flow_type: 'ingreso', amount_ves: 125800, bcv_rate: BCV, usd_equivalent: round2(125800 / BINANCE), description: 'Boleto CCS-MDE - Gomez (tasa Binance 629)', reference_type: 'manual', status: 'activo', created_by: userId, bank_account_id: bfc.id },
  ];
  for (const f of flows) {
    const exists = await db('treasury_cash_flows').where({ description: f.description, flow_date: f.flow_date }).first();
    if (!exists) { await db('treasury_cash_flows').insert(f); results.cash_flows++; }
  }

  // ─── 4. Treasury operations (compra de divisas) ───
  await ensureInternalAccounts();
  const accs = await db('internal_accounts').whereIn('code', ['PREST_ACC', 'BANCO_VES', 'BANCO_USD', 'CAJA_USD', 'GAN_CAMB', 'PERD_CAMB']);
  const getAcc = (code) => accs.find((a) => a.code === code);

  const ops = [
    { operation_date: yesterday, amount_ves: 500000, amount_usd: round2(500000 / BINANCE), bcv_rate: BCV, purchase_rate: BINANCE, purchase_type: 'pago_movil', destination_type: 'banco_usd', supplier_name: 'Cambista Carlos', description: 'Compra USD para operaciones' },
    { operation_date: today, amount_ves: 300000, amount_usd: round2(300000 / BINANCE), bcv_rate: BCV, purchase_rate: BINANCE, purchase_type: 'pago_movil', destination_type: 'banco_usd', supplier_name: 'Cambista Carlos', description: 'Compra USD para pago aerolinea' },
  ];
  for (const op of ops) {
    const exists = await db('treasury_operations').where({ operation_date: op.operation_date, amount_ves: op.amount_ves }).first();
    if (exists) continue;

    const usdBcv = round2(op.amount_ves / BCV);
    const diffUsd = round2(op.amount_usd - usdBcv);
    const diffVes = round2(diffUsd * BCV);

    const [inserted] = await db('treasury_operations').insert({
      ...op, diff_usd: diffUsd, exchange_difference: diffVes, status: 'completada', created_by: userId,
    }).returning('*');

    const ledger = [
      { operation_id: inserted.id, account_id: getAcc('PREST_ACC').id, movement_type: 'debito', amount: op.amount_ves, currency: 'VES', description: 'Salida VES - Compra USD', movement_date: op.operation_date },
      { operation_id: inserted.id, account_id: getAcc('BANCO_VES').id, movement_type: 'credito', amount: op.amount_ves, currency: 'VES', description: 'Salida banco VES', movement_date: op.operation_date },
      { operation_id: inserted.id, account_id: getAcc('BANCO_USD').id, movement_type: 'debito', amount: op.amount_usd, currency: 'USD', description: `Ingreso ${op.amount_usd} USD (tasa ${BINANCE})`, movement_date: op.operation_date },
      { operation_id: inserted.id, account_id: getAcc('PREST_ACC').id, movement_type: 'credito', amount: op.amount_ves, currency: 'VES', description: 'Liquidacion prestamo', movement_date: op.operation_date },
    ];
    if (diffVes !== 0) {
      ledger.push({ operation_id: inserted.id, account_id: getAcc(diffVes > 0 ? 'GAN_CAMB' : 'PERD_CAMB').id, movement_type: diffVes > 0 ? 'credito' : 'debito', amount: Math.abs(diffVes), currency: 'VES', description: diffVes > 0 ? 'Ganancia cambiaria' : 'Perdida cambiaria', movement_date: op.operation_date });
    }
    await db('treasury_ledger').insert(ledger);

    await db('treasury_cash_flows').insert({
      flow_date: op.operation_date, flow_type: 'egreso', amount_ves: op.amount_ves, bcv_rate: BCV,
      usd_equivalent: op.amount_usd, description: `Compra USD: ${op.amount_ves} VES a tasa ${BINANCE}`,
      reference_type: 'treasury_operation', reference_id: inserted.id, status: 'activo', created_by: userId, bank_account_id: bfc.id,
    });
    results.operations++;
  }

  // ─── 5. Exchange rates ───
  for (const r of [
    { rate_date: fourDaysAgo, rate: 430.50 }, { rate_date: threeDaysAgo, rate: 430.75 },
    { rate_date: twoDaysAgo, rate: 431.01 }, { rate_date: yesterday, rate: 431.01 }, { rate_date: today, rate: 431.01 },
  ]) {
    const exists = await db('exchange_rates').where({ rate_date: r.rate_date }).first();
    if (!exists) { await db('exchange_rates').insert({ ...r, source: 'bcv_api' }); results.exchange_rates++; }
  }

  return { message: 'Datos de prueba cargados', ...results };
}
