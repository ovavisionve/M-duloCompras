const router = require('express').Router();
const db = require('../database/connection');
const { authenticate, authorize } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { validateRif, paginate } = require('../utils/helpers');
const auditService = require('../services/auditService');

/**
 * @swagger
 * /suppliers:
 *   get:
 *     summary: Listar proveedores
 *     description: Obtiene una lista paginada de proveedores con opciones de búsqueda y filtrado
 *     tags: [Proveedores]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Buscar por razón social o RIF
 *       - in: query
 *         name: taxpayer_type
 *         schema:
 *           type: string
 *           enum: [ordinario, especial]
 *         description: Filtrar por tipo de contribuyente
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *         description: Filtrar por estado activo/inactivo
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Número de página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Registros por página
 *     responses:
 *       200:
 *         description: Lista paginada de proveedores
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
 *                     $ref: '#/components/schemas/Supplier'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { search, taxpayer_type, is_active, page = 1, limit = 20 } = req.query;
    const query = db('suppliers');

    if (search) {
      query.where(function () {
        this.where('business_name', 'ilike', `%${search}%`)
          .orWhere('rif', 'ilike', `%${search}%`);
      });
    }
    if (taxpayer_type) query.where('taxpayer_type', taxpayer_type);
    if (is_active !== undefined) query.where('is_active', is_active === 'true');

    const [{ count }] = await query.clone().count();
    const data = await query.orderBy('business_name').limit(limit).offset((page - 1) * limit);

    res.json({ success: true, ...paginate(data, parseInt(count), page, limit) });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /suppliers/search:
 *   get:
 *     summary: Buscar proveedor por RIF
 *     description: Busca un proveedor por su número de RIF
 *     tags: [Proveedores]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: rif
 *         required: true
 *         schema:
 *           type: string
 *         description: RIF del proveedor a buscar
 *     responses:
 *       200:
 *         description: Proveedor encontrado o null
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Supplier'
 *       400:
 *         description: RIF no proporcionado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/search', authenticate, async (req, res, next) => {
  try {
    const { rif } = req.query;
    if (!rif) throw new AppError('RIF requerido', 400);
    const supplier = await db('suppliers').where('rif', 'ilike', `%${rif}%`).first();
    res.json({ success: true, data: supplier || null });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /suppliers/{id}:
 *   get:
 *     summary: Obtener proveedor por ID
 *     description: Retorna los datos de un proveedor específico
 *     tags: [Proveedores]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del proveedor
 *     responses:
 *       200:
 *         description: Datos del proveedor
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Supplier'
 *       404:
 *         description: Proveedor no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const supplier = await db('suppliers').where({ id: req.params.id }).first();
    if (!supplier) throw new AppError('Proveedor no encontrado', 404);
    res.json({ success: true, data: supplier });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /suppliers/{id}/invoices:
 *   get:
 *     summary: Listar facturas de un proveedor
 *     description: Obtiene una lista paginada de facturas asociadas a un proveedor
 *     tags: [Proveedores]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del proveedor
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Número de página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Registros por página
 *     responses:
 *       200:
 *         description: Lista paginada de facturas del proveedor
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
 *                     $ref: '#/components/schemas/Invoice'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get('/:id/invoices', authenticate, async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const query = db('invoices').where({ supplier_id: req.params.id });
    const [{ count }] = await query.clone().count();
    const data = await query.orderBy('emission_date', 'desc').limit(limit).offset((page - 1) * limit);
    res.json({ success: true, ...paginate(data, parseInt(count), page, limit) });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /suppliers:
 *   post:
 *     summary: Crear proveedor
 *     description: Registra un nuevo proveedor en el sistema
 *     tags: [Proveedores]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SupplierInput'
 *     responses:
 *       201:
 *         description: Proveedor creado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Supplier'
 *       400:
 *         description: Datos inválidos o RIF con formato incorrecto
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Ya existe un proveedor con ese RIF
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', authenticate, authorize('admin', 'contador', 'operador'), async (req, res, next) => {
  try {
    const { rif, business_name, fiscal_address, phone, email, taxpayer_type, is_retention_agent } = req.body;
    if (!rif || !business_name) throw new AppError('RIF y Razón Social son requeridos', 400);
    if (!validateRif(rif)) throw new AppError('Formato de RIF inválido (V/J/E/G/P-XXXXXXXX-X)', 400, 'INVALID_RIF');

    const existing = await db('suppliers').where({ rif }).first();
    if (existing) throw new AppError('Ya existe un proveedor con este RIF', 409);

    const [supplier] = await db('suppliers').insert({
      rif, business_name, fiscal_address, phone, email,
      taxpayer_type: taxpayer_type || 'ordinario',
      is_retention_agent: is_retention_agent || false,
    }).returning('*');

    await auditService.logAction(req.user.id, 'supplier', supplier.id, 'create', null, supplier, req.ip);
    res.status(201).json({ success: true, data: supplier });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /suppliers/{id}:
 *   put:
 *     summary: Actualizar proveedor
 *     description: Actualiza los datos de un proveedor existente
 *     tags: [Proveedores]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del proveedor
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SupplierInput'
 *     responses:
 *       200:
 *         description: Proveedor actualizado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Supplier'
 *       404:
 *         description: Proveedor no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/:id', authenticate, authorize('admin', 'contador', 'operador'), async (req, res, next) => {
  try {
    const supplier = await db('suppliers').where({ id: req.params.id }).first();
    if (!supplier) throw new AppError('Proveedor no encontrado', 404);

    const { business_name, fiscal_address, phone, email, taxpayer_type, is_retention_agent } = req.body;
    const updates = {};
    if (business_name !== undefined) updates.business_name = business_name;
    if (fiscal_address !== undefined) updates.fiscal_address = fiscal_address;
    if (phone !== undefined) updates.phone = phone;
    if (email !== undefined) updates.email = email;
    if (taxpayer_type !== undefined) updates.taxpayer_type = taxpayer_type;
    if (is_retention_agent !== undefined) updates.is_retention_agent = is_retention_agent;
    updates.updated_at = new Date();

    const [updated] = await db('suppliers').where({ id: req.params.id }).update(updates).returning('*');

    await auditService.logAction(req.user.id, 'supplier', req.params.id, 'update', supplier, updated, req.ip);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /suppliers/{id}:
 *   delete:
 *     summary: Desactivar proveedor
 *     description: Realiza una eliminación lógica (soft delete) del proveedor. Solo administradores.
 *     tags: [Proveedores]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del proveedor
 *     responses:
 *       200:
 *         description: Proveedor desactivado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       404:
 *         description: Proveedor no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const supplier = await db('suppliers').where({ id: req.params.id }).first();
    if (!supplier) throw new AppError('Proveedor no encontrado', 404);

    await db('suppliers').where({ id: req.params.id }).update({ is_active: false, updated_at: new Date() });
    await auditService.logAction(req.user.id, 'supplier', req.params.id, 'delete', { is_active: true }, { is_active: false }, req.ip);
    res.json({ success: true, message: 'Proveedor desactivado' });
  } catch (err) { next(err); }
});

module.exports = router;
