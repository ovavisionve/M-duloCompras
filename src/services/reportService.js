const db = require('../database/connection');
const { round2 } = require('../utils/helpers');

/**
 * Accounts Payable Report - with full filtering
 */
async function getAccountsPayable(filters = {}, orgId) {
  const query = db('invoices')
    .join('suppliers', 'invoices.supplier_id', 'suppliers.id')
    .leftJoin('expense_categories', 'invoices.expense_category_id', 'expense_categories.id')
    .leftJoin('cost_centers', 'invoices.cost_center_id', 'cost_centers.id')
    .modify((q) => { if (orgId) q.where('invoices.organization_id', orgId); })
    .whereIn('invoices.status', ['registrada', 'pago_parcial'])
    .select(
      'invoices.*',
      'suppliers.rif as supplier_rif',
      'suppliers.business_name as supplier_name',
      'expense_categories.name as category_name',
      'cost_centers.name as cost_center_name'
    );

  // Filters
  if (filters.supplier_id) query.where('invoices.supplier_id', filters.supplier_id);
  if (filters.supplier_rif) query.where('suppliers.rif', filters.supplier_rif);
  if (filters.currency) query.where('invoices.currency', filters.currency);
  if (filters.category_id) query.where('invoices.expense_category_id', filters.category_id);
  if (filters.cost_center_id) query.where('invoices.cost_center_id', filters.cost_center_id);
  if (filters.fiscal_period) query.where('invoices.fiscal_period', filters.fiscal_period);
  if (filters.from_date) query.where('invoices.emission_date', '>=', filters.from_date);
  if (filters.to_date) query.where('invoices.emission_date', '<=', filters.to_date);
  if (filters.min_amount) query.where('invoices.total_ves', '>=', parseFloat(filters.min_amount));
  if (filters.max_amount) query.where('invoices.total_ves', '<=', parseFloat(filters.max_amount));
  if (filters.document_type) query.where('invoices.document_type', filters.document_type);

  query.orderBy('invoices.emission_date', 'asc');

  const invoices = await query;

  // Calculate aging
  const today = new Date();
  const data = invoices.map((inv) => {
    const emissionDate = new Date(inv.emission_date);
    const daysPending = Math.floor((today - emissionDate) / (1000 * 60 * 60 * 24));
    let aging;
    if (daysPending <= 30) aging = '0-30 días';
    else if (daysPending <= 60) aging = '31-60 días';
    else if (daysPending <= 90) aging = '61-90 días';
    else aging = '90+ días';
    return { ...inv, days_pending: daysPending, aging };
  });

  // Filter by aging bucket if specified
  const filtered = filters.aging
    ? data.filter((d) => d.aging === filters.aging)
    : data;

  // Summary by aging bucket
  const agingBuckets = {
    '0-30 días': { count: 0, total_ves: 0, total_usd: 0 },
    '31-60 días': { count: 0, total_ves: 0, total_usd: 0 },
    '61-90 días': { count: 0, total_ves: 0, total_usd: 0 },
    '90+ días': { count: 0, total_ves: 0, total_usd: 0 },
  };
  for (const inv of filtered) {
    agingBuckets[inv.aging].count++;
    agingBuckets[inv.aging].total_ves += parseFloat(inv.total_ves);
    agingBuckets[inv.aging].total_usd += parseFloat(inv.total_usd);
  }
  Object.keys(agingBuckets).forEach((k) => {
    agingBuckets[k].total_ves = round2(agingBuckets[k].total_ves);
    agingBuckets[k].total_usd = round2(agingBuckets[k].total_usd);
  });

  const summary = {
    total_invoices: filtered.length,
    total_ves: round2(filtered.reduce((s, i) => s + parseFloat(i.total_ves), 0)),
    total_usd: round2(filtered.reduce((s, i) => s + parseFloat(i.total_usd), 0)),
    aging_buckets: agingBuckets,
  };

  // Pagination
  const page = parseInt(filters.page) || 1;
  const limit = parseInt(filters.limit) || 100;
  const offset = (page - 1) * limit;
  const paginatedData = filtered.slice(offset, offset + limit);

  return {
    invoices: paginatedData,
    all_invoices: filtered,
    summary,
    pagination: { total: filtered.length, page, limit, pages: Math.ceil(filtered.length / limit) },
  };
}

/**
 * Expenses by Category Report - with full filtering
 */
async function getExpensesByCategory(filters = {}, orgId) {
  const query = db('invoices')
    .leftJoin('expense_categories', 'invoices.expense_category_id', 'expense_categories.id')
    .leftJoin('cost_centers', 'invoices.cost_center_id', 'cost_centers.id')
    .leftJoin('suppliers', 'invoices.supplier_id', 'suppliers.id')
    .modify((q) => { if (orgId) q.where('invoices.organization_id', orgId); })
    .whereIn('invoices.status', ['registrada', 'pago_parcial', 'pagada']);

  // Filters
  if (filters.period) query.where('invoices.fiscal_period', filters.period);
  if (filters.from_date) query.where('invoices.emission_date', '>=', filters.from_date);
  if (filters.to_date) query.where('invoices.emission_date', '<=', filters.to_date);
  if (filters.category_id) query.where('invoices.expense_category_id', filters.category_id);
  if (filters.cost_center_id) query.where('invoices.cost_center_id', filters.cost_center_id);
  if (filters.supplier_id) query.where('invoices.supplier_id', filters.supplier_id);
  if (filters.currency) query.where('invoices.currency', filters.currency);
  if (filters.status) query.where('invoices.status', filters.status);

  // Grouped data by category
  const grouped = await query.clone()
    .groupBy('expense_categories.id', 'expense_categories.name', 'expense_categories.code')
    .select(
      db.raw("COALESCE(expense_categories.name, 'Sin categoría') as category"),
      db.raw("COALESCE(expense_categories.code, 'N/A') as category_code"),
      db.raw('SUM(invoices.total_ves::numeric) as total_ves'),
      db.raw('SUM(invoices.total_usd::numeric) as total_usd'),
      db.raw('SUM(invoices.taxable_amount::numeric) as taxable_total'),
      db.raw('SUM(invoices.exempt_amount::numeric) as exempt_total'),
      db.raw('SUM(invoices.vat_amount::numeric) as vat_total'),
      db.raw('COUNT(*) as invoice_count')
    )
    .orderBy('total_ves', 'desc');

  // Grouped data by cost center
  const byCostCenter = await query.clone()
    .groupBy('cost_centers.id', 'cost_centers.name', 'cost_centers.code')
    .select(
      db.raw("COALESCE(cost_centers.name, 'Sin centro de costo') as cost_center"),
      db.raw("COALESCE(cost_centers.code, 'N/A') as cost_center_code"),
      db.raw('SUM(invoices.total_ves::numeric) as total_ves'),
      db.raw('SUM(invoices.total_usd::numeric) as total_usd'),
      db.raw('COUNT(*) as invoice_count')
    )
    .orderBy('total_ves', 'desc');

  // Detailed breakdown (category + supplier)
  const detailed = await query.clone()
    .groupBy('expense_categories.name', 'suppliers.business_name', 'suppliers.rif')
    .select(
      db.raw("COALESCE(expense_categories.name, 'Sin categoría') as category"),
      'suppliers.business_name as supplier_name',
      'suppliers.rif as supplier_rif',
      db.raw('SUM(invoices.total_ves::numeric) as total_ves'),
      db.raw('SUM(invoices.total_usd::numeric) as total_usd'),
      db.raw('COUNT(*) as invoice_count')
    )
    .orderBy('category', 'asc');

  const summary = {
    total_ves: round2(grouped.reduce((s, r) => s + parseFloat(r.total_ves || 0), 0)),
    total_usd: round2(grouped.reduce((s, r) => s + parseFloat(r.total_usd || 0), 0)),
    total_invoices: grouped.reduce((s, r) => s + parseInt(r.invoice_count), 0),
    category_count: grouped.length,
  };

  return { by_category: grouped, by_cost_center: byCostCenter, detailed, summary };
}

/**
 * Supplier Movements Report - with full filtering
 */
async function getSupplierMovements(supplierId, filters = {}, orgId) {
  // Get supplier info
  const query = db('suppliers').where({ id: supplierId });
  if (orgId) query.where('organization_id', orgId);
  const supplier = await query.first();
  if (!supplier) {
    const { AppError } = require('../middleware/errorHandler');
    throw new AppError('Proveedor no encontrado', 404, 'NOT_FOUND');
  }

  // Invoices query with filters
  const invQuery = db('invoices')
    .where({ supplier_id: supplierId })
    .whereNot('status', 'anulada');

  if (filters.from_date) invQuery.where('emission_date', '>=', filters.from_date);
  if (filters.to_date) invQuery.where('emission_date', '<=', filters.to_date);
  if (filters.fiscal_period) invQuery.where('fiscal_period', filters.fiscal_period);
  if (filters.document_type) invQuery.where('document_type', filters.document_type);
  if (filters.status) invQuery.where('status', filters.status);
  if (filters.currency) invQuery.where('currency', filters.currency);

  const invoices = await invQuery.orderBy('emission_date', 'desc');

  // Payments query with filters
  const payQuery = db('payment_invoices')
    .join('payments', 'payment_invoices.payment_id', 'payments.id')
    .join('invoices', 'payment_invoices.invoice_id', 'invoices.id')
    .where('invoices.supplier_id', supplierId)
    .where('payments.status', 'activo')
    .select('payments.*', 'payment_invoices.amount_applied', 'invoices.invoice_number');

  if (filters.from_date) payQuery.where('payments.payment_date', '>=', filters.from_date);
  if (filters.to_date) payQuery.where('payments.payment_date', '<=', filters.to_date);

  const payments = await payQuery.orderBy('payments.payment_date', 'desc');

  // Withholdings query with filters
  const whQuery = db('withholdings')
    .where({ supplier_id: supplierId, status: 'activa' });

  if (filters.from_date) whQuery.where('withholding_date', '>=', filters.from_date);
  if (filters.to_date) whQuery.where('withholding_date', '<=', filters.to_date);
  if (filters.fiscal_period) whQuery.where('fiscal_period', filters.fiscal_period);
  if (filters.withholding_type) whQuery.where('type', filters.withholding_type);

  const withholdings = await whQuery.orderBy('withholding_date', 'desc');

  const summary = {
    total_invoiced_ves: round2(invoices.reduce((s, i) => s + parseFloat(i.total_ves), 0)),
    total_invoiced_usd: round2(invoices.reduce((s, i) => s + parseFloat(i.total_usd), 0)),
    total_paid: round2(payments.reduce((s, p) => s + parseFloat(p.amount), 0)),
    total_withheld: round2(withholdings.reduce((s, w) => s + parseFloat(w.amount_ves), 0)),
    invoice_count: invoices.length,
    payment_count: payments.length,
    withholding_count: withholdings.length,
  };
  summary.balance_ves = round2(summary.total_invoiced_ves - summary.total_paid - summary.total_withheld);

  return { supplier, invoices, payments, withholdings, summary };
}

/**
 * Exchange Differences Report - with full filtering (fixed crash)
 */
async function getExchangeDifferences(filters = {}, orgId) {
  const query = db('payments')
    .leftJoin('payment_invoices', 'payments.id', 'payment_invoices.payment_id')
    .leftJoin('invoices', 'payment_invoices.invoice_id', 'invoices.id')
    .leftJoin('suppliers', 'invoices.supplier_id', 'suppliers.id')
    .modify((q) => { if (orgId) q.where('payments.organization_id', orgId); })
    .where('payments.status', 'activo')
    .select(
      'payments.*',
      db.raw("STRING_AGG(DISTINCT invoices.invoice_number, ', ') as related_invoices"),
      db.raw('STRING_AGG(DISTINCT suppliers.business_name, \', \') as supplier_names')
    )
    .groupBy('payments.id');

  // Apply filters
  if (filters.period) {
    const [month, year] = filters.period.split('/');
    if (month && year) {
      const startDate = `${year}-${month}-01`;
      const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];
      query.whereBetween('payments.payment_date', [startDate, endDate]);
    }
  }
  if (filters.from_date) query.where('payments.payment_date', '>=', filters.from_date);
  if (filters.to_date) query.where('payments.payment_date', '<=', filters.to_date);
  if (filters.currency) query.where('payments.currency', filters.currency);
  if (filters.payment_method) query.where('payments.payment_method', filters.payment_method);

  // By default show only payments with exchange differences
  if (filters.show_all !== 'true') {
    query.whereRaw('payments.exchange_difference != 0');
  }

  query.orderBy('payments.payment_date', 'asc');

  const payments = await query;

  const gains = payments.filter((p) => parseFloat(p.exchange_difference) > 0);
  const losses = payments.filter((p) => parseFloat(p.exchange_difference) < 0);

  const summary = {
    total_exchange_difference: round2(payments.reduce((s, p) => s + parseFloat(p.exchange_difference), 0)),
    total_gains: round2(gains.reduce((s, p) => s + parseFloat(p.exchange_difference), 0)),
    total_losses: round2(losses.reduce((s, p) => s + parseFloat(p.exchange_difference), 0)),
    count: payments.length,
    gain_count: gains.length,
    loss_count: losses.length,
  };

  return { payments, summary };
}

/**
 * Withholdings Summary Report
 */
async function getWithholdingsSummary(filters = {}, orgId) {
  const query = db('withholdings')
    .join('suppliers', 'withholdings.supplier_id', 'suppliers.id')
    .modify((q) => { if (orgId) q.where('withholdings.organization_id', orgId); })
    .where('withholdings.status', 'activa')
    .select(
      'withholdings.*',
      'suppliers.rif as supplier_rif',
      'suppliers.business_name as supplier_name'
    );

  if (filters.period) query.where('withholdings.fiscal_period', filters.period);
  if (filters.from_date) query.where('withholdings.withholding_date', '>=', filters.from_date);
  if (filters.to_date) query.where('withholdings.withholding_date', '<=', filters.to_date);
  if (filters.type) query.where('withholdings.type', filters.type);
  if (filters.supplier_id) query.where('withholdings.supplier_id', filters.supplier_id);

  query.orderBy('withholdings.withholding_date', 'asc');

  const withholdings = await query;

  // Group by type
  const byType = {};
  for (const w of withholdings) {
    if (!byType[w.type]) byType[w.type] = { count: 0, total_ves: 0, total_usd: 0, base_total: 0 };
    byType[w.type].count++;
    byType[w.type].total_ves += parseFloat(w.amount_ves);
    byType[w.type].total_usd += parseFloat(w.amount_usd);
    byType[w.type].base_total += parseFloat(w.base_amount);
  }
  Object.keys(byType).forEach((k) => {
    byType[k].total_ves = round2(byType[k].total_ves);
    byType[k].total_usd = round2(byType[k].total_usd);
    byType[k].base_total = round2(byType[k].base_total);
  });

  // Group by supplier
  const bySupplier = {};
  for (const w of withholdings) {
    const key = w.supplier_id;
    if (!bySupplier[key]) bySupplier[key] = { supplier_name: w.supplier_name, supplier_rif: w.supplier_rif, count: 0, total_ves: 0 };
    bySupplier[key].count++;
    bySupplier[key].total_ves += parseFloat(w.amount_ves);
  }
  const supplierList = Object.values(bySupplier).map((s) => ({ ...s, total_ves: round2(s.total_ves) }));
  supplierList.sort((a, b) => b.total_ves - a.total_ves);

  const summary = {
    total_count: withholdings.length,
    total_ves: round2(withholdings.reduce((s, w) => s + parseFloat(w.amount_ves), 0)),
    total_usd: round2(withholdings.reduce((s, w) => s + parseFloat(w.amount_usd), 0)),
    by_type: byType,
  };

  return { withholdings, by_supplier: supplierList, summary };
}

/**
 * Payment Summary Report
 */
async function getPaymentSummary(filters = {}, orgId) {
  const query = db('payments')
    .modify((q) => { if (orgId) q.where('payments.organization_id', orgId); })
    .where('payments.status', 'activo');

  if (filters.period) {
    const [month, year] = filters.period.split('/');
    if (month && year) {
      const startDate = `${year}-${month}-01`;
      const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];
      query.whereBetween('payments.payment_date', [startDate, endDate]);
    }
  }
  if (filters.from_date) query.where('payments.payment_date', '>=', filters.from_date);
  if (filters.to_date) query.where('payments.payment_date', '<=', filters.to_date);
  if (filters.payment_method) query.where('payments.payment_method', filters.payment_method);
  if (filters.currency) query.where('payments.currency', filters.currency);
  if (filters.bank_id) query.where('payments.sender_bank_id', filters.bank_id);

  query.orderBy('payments.payment_date', 'asc');

  const payments = await query;

  // Group by method
  const byMethod = {};
  for (const p of payments) {
    const method = p.payment_method;
    if (!byMethod[method]) byMethod[method] = { count: 0, total: 0 };
    byMethod[method].count++;
    byMethod[method].total += parseFloat(p.amount);
  }
  Object.keys(byMethod).forEach((k) => { byMethod[k].total = round2(byMethod[k].total); });

  // Group by currency
  const byCurrency = {};
  for (const p of payments) {
    const cur = p.currency;
    if (!byCurrency[cur]) byCurrency[cur] = { count: 0, total: 0 };
    byCurrency[cur].count++;
    byCurrency[cur].total += parseFloat(p.amount);
  }
  Object.keys(byCurrency).forEach((k) => { byCurrency[k].total = round2(byCurrency[k].total); });

  const summary = {
    total_count: payments.length,
    total_amount: round2(payments.reduce((s, p) => s + parseFloat(p.amount), 0)),
    total_islr: round2(payments.reduce((s, p) => s + parseFloat(p.islr_withheld || 0), 0)),
    total_iva: round2(payments.reduce((s, p) => s + parseFloat(p.iva_withheld || 0), 0)),
    by_method: byMethod,
    by_currency: byCurrency,
  };

  return { payments, summary };
}

module.exports = {
  getAccountsPayable,
  getExpensesByCategory,
  getSupplierMovements,
  getExchangeDifferences,
  getWithholdingsSummary,
  getPaymentSummary,
};
