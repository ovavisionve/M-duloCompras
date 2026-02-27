const router = require('express').Router();
const db = require('../database/connection');
const { authenticate } = require('../middleware/auth');
const { round2 } = require('../utils/helpers');

// GET /reports/accounts-payable
router.get('/accounts-payable', authenticate, async (req, res, next) => {
  try {
    const invoices = await db('invoices')
      .join('suppliers', 'invoices.supplier_id', 'suppliers.id')
      .whereIn('invoices.status', ['registrada', 'pago_parcial'])
      .select(
        'invoices.*',
        'suppliers.rif as supplier_rif',
        'suppliers.business_name as supplier_name'
      )
      .orderBy('invoices.emission_date', 'asc');

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

    const summary = {
      total_invoices: data.length,
      total_ves: round2(data.reduce((s, i) => s + parseFloat(i.total_ves), 0)),
      total_usd: round2(data.reduce((s, i) => s + parseFloat(i.total_usd), 0)),
    };

    res.json({ success: true, data: { invoices: data, summary } });
  } catch (err) { next(err); }
});

// GET /reports/expenses-by-category?period=MM/YYYY
router.get('/expenses-by-category', authenticate, async (req, res, next) => {
  try {
    const { period } = req.query;
    const query = db('invoices')
      .leftJoin('expense_categories', 'invoices.expense_category_id', 'expense_categories.id')
      .whereIn('invoices.status', ['registrada', 'pago_parcial', 'pagada'])
      .groupBy('expense_categories.name')
      .select(
        db.raw("COALESCE(expense_categories.name, 'Sin categoría') as category"),
        db.raw('SUM(invoices.total_ves) as total_ves'),
        db.raw('SUM(invoices.total_usd) as total_usd'),
        db.raw('COUNT(*) as invoice_count')
      )
      .orderBy('total_ves', 'desc');

    if (period) query.where('invoices.fiscal_period', period);

    const data = await query;
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// GET /reports/supplier-movements/:id
router.get('/supplier-movements/:id', authenticate, async (req, res, next) => {
  try {
    const invoices = await db('invoices')
      .where({ supplier_id: req.params.id })
      .whereNot('status', 'anulada')
      .orderBy('emission_date', 'desc');

    const payments = await db('payment_invoices')
      .join('payments', 'payment_invoices.payment_id', 'payments.id')
      .join('invoices', 'payment_invoices.invoice_id', 'invoices.id')
      .where('invoices.supplier_id', req.params.id)
      .where('payments.status', 'activo')
      .select('payments.*', 'payment_invoices.amount_applied', 'invoices.invoice_number');

    const withholdings = await db('withholdings')
      .where({ supplier_id: req.params.id, status: 'activa' })
      .orderBy('withholding_date', 'desc');

    res.json({ success: true, data: { invoices, payments, withholdings } });
  } catch (err) { next(err); }
});

// GET /reports/exchange-differences?period=MM/YYYY
router.get('/exchange-differences', authenticate, async (req, res, next) => {
  try {
    const { period } = req.query;
    const [month, year] = (period || '').split('/');
    const startDate = `${year}-${month}-01`;
    const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];

    const payments = await db('payments')
      .where('status', 'activo')
      .whereBetween('payment_date', [startDate, endDate])
      .whereNot('exchange_difference', 0)
      .orderBy('payment_date');

    const totalDiff = round2(payments.reduce((s, p) => s + parseFloat(p.exchange_difference), 0));

    res.json({ success: true, data: { payments, summary: { total_exchange_difference: totalDiff, count: payments.length } } });
  } catch (err) { next(err); }
});

// GET /reports/audit-log
router.get('/audit-log', authenticate, async (req, res, next) => {
  try {
    const auditService = require('../services/auditService');
    const result = await auditService.getAuditLogs(req.query);
    res.json({ success: true, data: result.data, pagination: { total: result.total, page: result.page, limit: result.limit } });
  } catch (err) { next(err); }
});

module.exports = router;
