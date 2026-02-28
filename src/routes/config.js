const router = require('express').Router();
const db = require('../database/connection');
const { authenticate, authorize } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const auditService = require('../services/auditService');

// GET /config/expense-categories
router.get('/expense-categories', authenticate, async (req, res, next) => {
  try {
    const categories = await db('expense_categories').where({ is_active: true }).orderBy('name');
    res.json({ success: true, data: categories });
  } catch (err) { next(err); }
});

// POST /config/expense-categories
router.post('/expense-categories', authenticate, authorize('admin', 'contador'), async (req, res, next) => {
  try {
    const { name, code, description } = req.body;
    if (!name || !code) throw new AppError('Nombre y código requeridos', 400);
    const exists = await db('expense_categories').where({ name }).orWhere({ code }).first();
    if (exists) throw new AppError('Ya existe una categoría con ese nombre o código', 409);
    const [cat] = await db('expense_categories').insert({ name, code, description }).returning('*');
    res.status(201).json({ success: true, data: cat });
  } catch (err) { next(err); }
});

// GET /config/cost-centers
router.get('/cost-centers', authenticate, async (req, res, next) => {
  try {
    const centers = await db('cost_centers').where({ is_active: true }).orderBy('name');
    res.json({ success: true, data: centers });
  } catch (err) { next(err); }
});

// POST /config/cost-centers
router.post('/cost-centers', authenticate, authorize('admin', 'contador'), async (req, res, next) => {
  try {
    const { name, code, description } = req.body;
    if (!name || !code) throw new AppError('Nombre y código requeridos', 400);
    const exists = await db('cost_centers').where({ name }).orWhere({ code }).first();
    if (exists) throw new AppError('Ya existe un centro de costo con ese nombre o código', 409);
    const [center] = await db('cost_centers').insert({ name, code, description }).returning('*');
    res.status(201).json({ success: true, data: center });
  } catch (err) { next(err); }
});

// GET /config/tax-unit
router.get('/tax-unit', authenticate, async (req, res, next) => {
  try {
    const config = await db('config').where({ key: 'tax_unit_value' }).first();
    res.json({ success: true, data: { value: parseFloat(config?.value || '0') } });
  } catch (err) { next(err); }
});

// PUT /config/tax-unit
router.put('/tax-unit', authenticate, authorize('admin', 'contador'), async (req, res, next) => {
  try {
    const { value } = req.body;
    if (!value) throw new AppError('Valor requerido', 400);
    const old = await db('config').where({ key: 'tax_unit_value' }).first();
    await db('config').where({ key: 'tax_unit_value' }).update({ value: String(value), updated_at: new Date() });
    await auditService.logAction(req.user.id, 'config', old.id, 'update', { value: old.value }, { value: String(value) }, req.ip);
    res.json({ success: true, data: { value: parseFloat(value) } });
  } catch (err) { next(err); }
});

// GET /config/company
router.get('/company', authenticate, async (req, res, next) => {
  try {
    const configs = await db('config').whereIn('key', ['company_rif', 'company_name', 'company_address', 'is_special_taxpayer']);
    const data = {};
    configs.forEach((c) => { data[c.key] = c.value; });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// PUT /config/company
router.put('/company', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const allowedKeys = ['company_rif', 'company_name', 'company_address', 'is_special_taxpayer'];
    for (const [key, value] of Object.entries(req.body)) {
      if (allowedKeys.includes(key)) {
        await db('config').where({ key }).update({ value: String(value), updated_at: new Date() });
      }
    }
    res.json({ success: true, message: 'Configuración actualizada' });
  } catch (err) { next(err); }
});

// GET /config/withholding-rules
router.get('/withholding-rules', authenticate, async (req, res, next) => {
  try {
    const rules = await db('withholding_rules').where({ is_active: true }).orderBy('type', 'concept_code');
    res.json({ success: true, data: rules });
  } catch (err) { next(err); }
});

// PUT /config/withholding-rules/:id
router.put('/withholding-rules/:id', authenticate, authorize('admin', 'contador'), async (req, res, next) => {
  try {
    const rule = await db('withholding_rules').where({ id: req.params.id }).first();
    if (!rule) throw new AppError('Regla no encontrada', 404);

    const { rate, subtract_ut, is_active, concept_name } = req.body;
    const updates = {};
    if (rate !== undefined) updates.rate = rate;
    if (subtract_ut !== undefined) updates.subtract_ut = subtract_ut;
    if (is_active !== undefined) updates.is_active = is_active;
    if (concept_name !== undefined) updates.concept_name = concept_name;
    updates.updated_at = new Date();

    const [updated] = await db('withholding_rules').where({ id: req.params.id }).update(updates).returning('*');
    await auditService.logAction(req.user.id, 'withholding_rule', req.params.id, 'update', rule, updated, req.ip);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

module.exports = router;
