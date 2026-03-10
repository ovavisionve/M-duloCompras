const router = require('express').Router();
const db = require('../database/connection');
const { authenticate, authorize } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const auditService = require('../services/auditService');

/**
 * @swagger
 * /config/expense-categories:
 *   get:
 *     summary: Listar categorías de gasto
 *     description: Obtiene todas las categorías de gasto activas
 *     tags: [Configuración]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de categorías de gasto
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       name:
 *                         type: string
 *                       code:
 *                         type: string
 *                       description:
 *                         type: string
 */
router.get('/expense-categories', authenticate, async (req, res, next) => {
  try {
    const showAll = req.query.all === 'true';
    const categories = await db('expense_categories').where('organization_id', req.user.organizationId).modify((q) => { if (!showAll) q.where({ is_active: true }); }).orderBy('name');
    res.json({ success: true, data: categories });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /config/expense-categories:
 *   post:
 *     summary: Crear categoría de gasto
 *     description: Registra una nueva categoría de gasto
 *     tags: [Configuración]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - code
 *             properties:
 *               name:
 *                 type: string
 *                 description: Nombre de la categoría
 *               code:
 *                 type: string
 *                 description: Código único de la categoría
 *               description:
 *                 type: string
 *                 description: Descripción de la categoría
 *     responses:
 *       201:
 *         description: Categoría creada exitosamente
 *       400:
 *         description: Nombre y código requeridos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Ya existe una categoría con ese nombre o código
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/expense-categories', authenticate, authorize('admin', 'contador'), async (req, res, next) => {
  try {
    const { name, code, description } = req.body;
    if (!name || !code) throw new AppError('Nombre y código requeridos', 400);
    const orgId = req.user.organizationId;
    const exists = await db('expense_categories').where('organization_id', orgId).where(function() { this.where({ name }).orWhere({ code }); }).first();
    if (exists) throw new AppError('Ya existe una categoría con ese nombre o código', 409);
    const [cat] = await db('expense_categories').insert({ name, code, description, organization_id: orgId }).returning('*');
    res.status(201).json({ success: true, data: cat });
  } catch (err) { next(err); }
});

// PATCH /config/expense-categories/:id/toggle - Toggle active status
router.patch('/expense-categories/:id/toggle', authenticate, authorize('admin', 'contador'), async (req, res, next) => {
  try {
    const cat = await db('expense_categories').where({ id: req.params.id, organization_id: req.user.organizationId }).first();
    if (!cat) throw new AppError('Categoría no encontrada', 404);
    const [updated] = await db('expense_categories').where({ id: req.params.id })
      .update({ is_active: !cat.is_active, updated_at: new Date() }).returning('*');
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// DELETE /config/expense-categories/:id - Soft delete (set inactive)
router.delete('/expense-categories/:id', authenticate, authorize('admin', 'contador'), async (req, res, next) => {
  try {
    const cat = await db('expense_categories').where({ id: req.params.id, organization_id: req.user.organizationId }).first();
    if (!cat) throw new AppError('Categoría no encontrada', 404);
    // Check if used by any invoice
    const used = await db('invoices').where({ expense_category_id: req.params.id }).first();
    if (used) {
      // Soft delete — just deactivate
      await db('expense_categories').where({ id: req.params.id }).update({ is_active: false, updated_at: new Date() });
      return res.json({ success: true, message: 'Categoría desactivada (tiene facturas asociadas)' });
    }
    await db('expense_categories').where({ id: req.params.id }).del();
    res.json({ success: true, message: 'Categoría eliminada' });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /config/cost-centers:
 *   get:
 *     summary: Listar centros de costo
 *     description: Obtiene todos los centros de costo activos
 *     tags: [Configuración]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de centros de costo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       name:
 *                         type: string
 *                       code:
 *                         type: string
 *                       description:
 *                         type: string
 */
router.get('/cost-centers', authenticate, async (req, res, next) => {
  try {
    const showAll = req.query.all === 'true';
    const centers = await db('cost_centers').where('organization_id', req.user.organizationId).modify((q) => { if (!showAll) q.where({ is_active: true }); }).orderBy('name');
    res.json({ success: true, data: centers });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /config/cost-centers:
 *   post:
 *     summary: Crear centro de costo
 *     description: Registra un nuevo centro de costo
 *     tags: [Configuración]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - code
 *             properties:
 *               name:
 *                 type: string
 *                 description: Nombre del centro de costo
 *               code:
 *                 type: string
 *                 description: Código único del centro de costo
 *               description:
 *                 type: string
 *                 description: Descripción del centro de costo
 *     responses:
 *       201:
 *         description: Centro de costo creado exitosamente
 *       400:
 *         description: Nombre y código requeridos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Ya existe un centro de costo con ese nombre o código
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/cost-centers', authenticate, authorize('admin', 'contador'), async (req, res, next) => {
  try {
    const { name, code, description } = req.body;
    if (!name || !code) throw new AppError('Nombre y código requeridos', 400);
    const orgId = req.user.organizationId;
    const exists = await db('cost_centers').where('organization_id', orgId).where(function() { this.where({ name }).orWhere({ code }); }).first();
    if (exists) throw new AppError('Ya existe un centro de costo con ese nombre o código', 409);
    const [center] = await db('cost_centers').insert({ name, code, description, organization_id: orgId }).returning('*');
    res.status(201).json({ success: true, data: center });
  } catch (err) { next(err); }
});

// PATCH /config/cost-centers/:id/toggle - Toggle active status
router.patch('/cost-centers/:id/toggle', authenticate, authorize('admin', 'contador'), async (req, res, next) => {
  try {
    const cc = await db('cost_centers').where({ id: req.params.id, organization_id: req.user.organizationId }).first();
    if (!cc) throw new AppError('Centro de costo no encontrado', 404);
    const [updated] = await db('cost_centers').where({ id: req.params.id })
      .update({ is_active: !cc.is_active, updated_at: new Date() }).returning('*');
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// DELETE /config/cost-centers/:id - Soft delete (set inactive)
router.delete('/cost-centers/:id', authenticate, authorize('admin', 'contador'), async (req, res, next) => {
  try {
    const cc = await db('cost_centers').where({ id: req.params.id, organization_id: req.user.organizationId }).first();
    if (!cc) throw new AppError('Centro de costo no encontrado', 404);
    const used = await db('invoices').where({ cost_center_id: req.params.id }).first();
    if (used) {
      await db('cost_centers').where({ id: req.params.id }).update({ is_active: false, updated_at: new Date() });
      return res.json({ success: true, message: 'Centro de costo desactivado (tiene facturas asociadas)' });
    }
    await db('cost_centers').where({ id: req.params.id }).del();
    res.json({ success: true, message: 'Centro de costo eliminado' });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /config/tax-unit:
 *   get:
 *     summary: Obtener valor de la unidad tributaria
 *     description: Retorna el valor actual de la unidad tributaria (UT)
 *     tags: [Configuración]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Valor de la unidad tributaria
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     value:
 *                       type: number
 *                       description: Valor actual de la UT en Bs
 */
router.get('/tax-unit', authenticate, async (req, res, next) => {
  try {
    const config = await db('config').where({ key: 'tax_unit_value', organization_id: req.user.organizationId }).first();
    res.json({ success: true, data: { value: parseFloat(config?.value || '0') } });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /config/tax-unit:
 *   put:
 *     summary: Actualizar unidad tributaria
 *     description: Actualiza el valor de la unidad tributaria (UT)
 *     tags: [Configuración]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - value
 *             properties:
 *               value:
 *                 type: number
 *                 description: Nuevo valor de la UT en Bs
 *     responses:
 *       200:
 *         description: Unidad tributaria actualizada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     value:
 *                       type: number
 *       400:
 *         description: Valor requerido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/tax-unit', authenticate, authorize('admin', 'contador'), async (req, res, next) => {
  try {
    const { value } = req.body;
    if (!value) throw new AppError('Valor requerido', 400);
    const orgId = req.user.organizationId;
    const old = await db('config').where({ key: 'tax_unit_value', organization_id: orgId }).first();
    await db('config').where({ key: 'tax_unit_value', organization_id: orgId }).update({ value: String(value), updated_at: new Date() });
    await auditService.logAction(req.user.id, 'config', old.id, 'update', { value: old.value }, { value: String(value) }, req.ip, orgId);
    res.json({ success: true, data: { value: parseFloat(value) } });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /config/company:
 *   get:
 *     summary: Obtener datos de la empresa
 *     description: Retorna la configuración de la empresa (RIF, nombre, dirección, contribuyente especial)
 *     tags: [Configuración]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Datos de la empresa
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/CompanyConfig'
 */
router.get('/company', authenticate, async (req, res, next) => {
  try {
    const configs = await db('config').where('organization_id', req.user.organizationId).whereIn('key', ['company_rif', 'company_name', 'company_address', 'is_special_taxpayer']);
    const data = {};
    configs.forEach((c) => { data[c.key] = c.value; });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /config/company:
 *   put:
 *     summary: Actualizar datos de la empresa
 *     description: Actualiza la configuración de la empresa (RIF, nombre, dirección, contribuyente especial). Solo administradores.
 *     tags: [Configuración]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CompanyConfig'
 *     responses:
 *       200:
 *         description: Configuración actualizada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 */
router.put('/company', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const allowedKeys = ['company_rif', 'company_name', 'company_address', 'is_special_taxpayer'];
    const orgId = req.user.organizationId;
    for (const [key, value] of Object.entries(req.body)) {
      if (allowedKeys.includes(key)) {
        await db('config').where({ key, organization_id: orgId }).update({ value: String(value), updated_at: new Date() });
      }
    }
    res.json({ success: true, message: 'Configuración actualizada' });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /config/withholding-rules:
 *   get:
 *     summary: Listar reglas de retención
 *     description: Obtiene todas las reglas de retención activas
 *     tags: [Configuración]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de reglas de retención
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/WithholdingRule'
 */
router.get('/withholding-rules', authenticate, async (req, res, next) => {
  try {
    const rules = await db('withholding_rules').where({ is_active: true }).orderBy('type', 'concept_code');
    res.json({ success: true, data: rules });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /config/withholding-rules/{id}:
 *   put:
 *     summary: Actualizar regla de retención
 *     description: Actualiza una regla de retención existente (tasa, sustraendo UT, estado)
 *     tags: [Configuración]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la regla de retención
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rate:
 *                 type: number
 *                 description: Porcentaje de retención
 *               subtract_ut:
 *                 type: number
 *                 description: Sustraendo en unidades tributarias
 *               is_active:
 *                 type: boolean
 *                 description: Estado activo/inactivo
 *               concept_name:
 *                 type: string
 *                 description: Nombre del concepto
 *     responses:
 *       200:
 *         description: Regla de retención actualizada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/WithholdingRule'
 *       404:
 *         description: Regla no encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
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
    await auditService.logAction(req.user.id, 'withholding_rule', req.params.id, 'update', rule, updated, req.ip, req.user.organizationId);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

module.exports = router;
