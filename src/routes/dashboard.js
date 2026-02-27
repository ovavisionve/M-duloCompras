const router = require('express').Router();
const db = require('../database/connection');
const { authenticate } = require('../middleware/auth');
const { round2 } = require('../utils/helpers');
const exchangeRateService = require('../services/exchangeRateService');

// GET /dashboard
router.get('/', authenticate, async (req, res, next) => {
  try {
    const now = new Date();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const currentYear = now.getFullYear();
    const currentPeriod = `${currentMonth}/${currentYear}`;
    const startDate = `${currentYear}-${currentMonth}-01`;
    const endDate = new Date(currentYear, now.getMonth() + 1, 0).toISOString().split('T')[0];

    // Monthly totals
    const monthlyTotals = await db('invoices')
      .where('fiscal_period', currentPeriod)
      .whereIn('status', ['registrada', 'pago_parcial', 'pagada'])
      .select(
        db.raw('COALESCE(SUM(total_ves), 0) as total_ves'),
        db.raw('COALESCE(SUM(total_usd), 0) as total_usd'),
        db.raw('COUNT(*) as invoice_count')
      )
      .first();

    // Pending invoices
    const pending = await db('invoices')
      .whereIn('status', ['registrada', 'pago_parcial'])
      .select(
        db.raw('COALESCE(SUM(total_ves), 0) as total_ves'),
        db.raw('COALESCE(SUM(total_usd), 0) as total_usd'),
        db.raw('COUNT(*) as count')
      )
      .first();

    // Overdue invoices (>30 days pending)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0];
    const overdue = await db('invoices')
      .whereIn('status', ['registrada', 'pago_parcial'])
      .where('emission_date', '<', thirtyDaysAgo)
      .select(db.raw('COUNT(*) as count'), db.raw('COALESCE(SUM(total_ves), 0) as total_ves'))
      .first();

    // Top 5 suppliers
    const topSuppliers = await db('invoices')
      .join('suppliers', 'invoices.supplier_id', 'suppliers.id')
      .where('invoices.fiscal_period', currentPeriod)
      .whereIn('invoices.status', ['registrada', 'pago_parcial', 'pagada'])
      .groupBy('suppliers.id', 'suppliers.business_name')
      .select('suppliers.business_name', db.raw('SUM(invoices.total_ves) as total_ves'))
      .orderBy('total_ves', 'desc')
      .limit(5);

    // Expenses by category
    const byCategory = await db('invoices')
      .leftJoin('expense_categories', 'invoices.expense_category_id', 'expense_categories.id')
      .where('invoices.fiscal_period', currentPeriod)
      .whereIn('invoices.status', ['registrada', 'pago_parcial', 'pagada'])
      .groupBy('expense_categories.name')
      .select(
        db.raw("COALESCE(expense_categories.name, 'Sin categoría') as category"),
        db.raw('SUM(invoices.total_ves) as total_ves')
      );

    // Monthly evolution (last 6 months)
    const sixMonthsAgo = new Date(currentYear, now.getMonth() - 5, 1);
    const monthlyEvolution = await db('invoices')
      .whereIn('status', ['registrada', 'pago_parcial', 'pagada'])
      .where('emission_date', '>=', sixMonthsAgo.toISOString().split('T')[0])
      .groupBy('fiscal_period')
      .select('fiscal_period', db.raw('SUM(total_ves) as total_ves'), db.raw('SUM(total_usd) as total_usd'))
      .orderBy('fiscal_period');

    // Withholdings of the period
    const withholdingsSummary = await db('withholdings')
      .where({ fiscal_period: currentPeriod, status: 'activa' })
      .select(
        db.raw('COUNT(*) as count'),
        db.raw('COALESCE(SUM(amount_ves), 0) as total_ves')
      )
      .first();

    // Bank balances
    const bankBalances = await db('bank_accounts')
      .where({ is_active: true })
      .select('bank_name', 'account_number', 'currency', 'current_balance');

    // Today's exchange rate
    const todayRate = await exchangeRateService.getTodayRate();

    res.json({
      success: true,
      data: {
        period: currentPeriod,
        monthly_totals: monthlyTotals,
        pending_invoices: pending,
        overdue_invoices: overdue,
        top_suppliers: topSuppliers,
        expenses_by_category: byCategory,
        monthly_evolution: monthlyEvolution,
        withholdings_summary: withholdingsSummary,
        bank_balances: bankBalances,
        exchange_rate: todayRate,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
