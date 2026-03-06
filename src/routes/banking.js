const router = require('express').Router();
const db = require('../database/connection');
const { authenticate, authorize } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const bankingService = require('../services/bankingService');
const auditService = require('../services/auditService');

/**
 * @swagger
 * /banking/bank-accounts:
 *   get:
 *     summary: Listar cuentas bancarias
 *     description: Retorna todas las cuentas bancarias registradas, ordenadas por nombre de banco
 *     tags: [Banca]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de cuentas bancarias
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
 *                     $ref: '#/components/schemas/BankAccount'
 */
// GET /banking/bank-accounts
router.get('/bank-accounts', authenticate, async (req, res, next) => {
  try {
    const accounts = await db('bank_accounts').orderBy('bank_name');
    res.json({ success: true, data: accounts });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /banking/bank-accounts:
 *   post:
 *     summary: Crear cuenta bancaria
 *     description: Registra una nueva cuenta bancaria. Requiere rol admin o tesorero.
 *     tags: [Banca]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bank_name
 *               - account_type
 *               - account_number
 *               - currency
 *             properties:
 *               bank_name:
 *                 type: string
 *                 example: "Banco Nacional"
 *               account_type:
 *                 type: string
 *                 example: "corriente"
 *               account_number:
 *                 type: string
 *                 example: "0102-0345-67-8901234567"
 *               currency:
 *                 type: string
 *                 example: "VES"
 *               initial_balance:
 *                 type: number
 *                 example: 0
 *     responses:
 *       201:
 *         description: Cuenta bancaria creada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/BankAccount'
 *       400:
 *         description: Campos requeridos faltantes
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: No autorizado (requiere rol admin o tesorero)
 */
// POST /banking/bank-accounts
router.post('/bank-accounts', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const { bank_name, account_type, account_number, currency, initial_balance } = req.body;
    if (!bank_name || !account_type || !account_number || !currency) {
      throw new AppError('Todos los campos son requeridos', 400);
    }

    const [account] = await db('bank_accounts').insert({
      bank_name, account_type, account_number, currency,
      initial_balance: initial_balance || 0,
      current_balance: initial_balance || 0,
    }).returning('*');

    await auditService.logAction(req.user.id, 'bank_account', account.id, 'create', null, account, req.ip);
    res.status(201).json({ success: true, data: account });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /banking/bank-accounts/{id}/statements:
 *   post:
 *     summary: Importar movimientos bancarios
 *     description: Importa un lote de movimientos bancarios desde un estado de cuenta. Requiere rol admin, tesorero o contador.
 *     tags: [Banca]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la cuenta bancaria
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - movements
 *             properties:
 *               movements:
 *                 type: array
 *                 items:
 *                   type: object
 *                 description: Lista de movimientos a importar
 *     responses:
 *       201:
 *         description: Movimientos importados exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       400:
 *         description: Debe enviar al menos un movimiento
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: No autorizado
 */
// POST /banking/bank-accounts/:id/statements (import movements)
router.post('/bank-accounts/:id/statements', authenticate, authorize('admin', 'tesorero', 'contador'), async (req, res, next) => {
  try {
    const { movements } = req.body;
    if (!movements?.length) throw new AppError('Debe enviar al menos un movimiento', 400);
    const result = await bankingService.importMovements(req.params.id, movements);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /banking/bank-accounts/{id}/movements:
 *   get:
 *     summary: Listar movimientos de cuenta bancaria
 *     description: Retorna los movimientos bancarios de una cuenta, con filtros opcionales por fecha y estado de conciliación
 *     tags: [Banca]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la cuenta bancaria
 *       - in: query
 *         name: from_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Fecha inicial del rango
 *       - in: query
 *         name: to_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Fecha final del rango
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, reconciled]
 *         description: Estado de conciliación
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
 *           default: 50
 *         description: Registros por página
 *     responses:
 *       200:
 *         description: Lista de movimientos con paginación
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
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
// GET /banking/bank-accounts/:id/movements
router.get('/bank-accounts/:id/movements', authenticate, async (req, res, next) => {
  try {
    const { from_date, to_date, status, page = 1, limit = 50 } = req.query;
    const query = db('bank_movements')
      .leftJoin('payments', 'bank_movements.matched_payment_id', 'payments.id')
      .where('bank_movements.bank_account_id', req.params.id)
      .select('bank_movements.*', 'payments.reference_number as payment_reference');

    if (from_date) query.where('bank_movements.movement_date', '>=', from_date);
    if (to_date) query.where('bank_movements.movement_date', '<=', to_date);
    if (status) query.where('bank_movements.reconciliation_status', status);

    const [{ count }] = await query.clone().clear('select').count('* as count');
    const data = await query.orderBy('bank_movements.movement_date', 'desc').limit(limit).offset((page - 1) * limit);

    res.json({ success: true, data, pagination: { total: parseInt(count), page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /banking/reconciliation/auto:
 *   post:
 *     summary: Conciliación bancaria automática
 *     description: Ejecuta el proceso de conciliación automática para una cuenta bancaria, emparejando movimientos con pagos registrados
 *     tags: [Banca]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bank_account_id
 *             properties:
 *               bank_account_id:
 *                 type: integer
 *                 description: ID de la cuenta bancaria
 *     responses:
 *       200:
 *         description: Resultado de la conciliación automática
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       400:
 *         description: ID de cuenta bancaria requerido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: No autorizado
 */
// POST /banking/reconciliation/auto
router.post('/reconciliation/auto', authenticate, authorize('admin', 'tesorero', 'contador'), async (req, res, next) => {
  try {
    const { bank_account_id } = req.body;
    if (!bank_account_id) throw new AppError('ID de cuenta bancaria requerido', 400);
    const result = await bankingService.autoReconcile(bank_account_id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /banking/reconciliation/manual:
 *   post:
 *     summary: Conciliación bancaria manual
 *     description: Vincula manualmente un movimiento bancario con un pago registrado
 *     tags: [Banca]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - movement_id
 *               - payment_id
 *             properties:
 *               movement_id:
 *                 type: integer
 *                 description: ID del movimiento bancario
 *               payment_id:
 *                 type: integer
 *                 description: ID del pago registrado
 *     responses:
 *       200:
 *         description: Conciliación manual realizada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       400:
 *         description: IDs de movimiento y pago requeridos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: No autorizado
 */
// POST /banking/reconciliation/manual
router.post('/reconciliation/manual', authenticate, authorize('admin', 'tesorero', 'contador'), async (req, res, next) => {
  try {
    const { movement_id, payment_id } = req.body;
    if (!movement_id || !payment_id) throw new AppError('IDs de movimiento y pago requeridos', 400);
    const result = await bankingService.manualReconcile(movement_id, payment_id, req.user.id, req.ip);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /banking/reconciliation/report:
 *   get:
 *     summary: Reporte de conciliación bancaria
 *     description: Genera el reporte de conciliación para una cuenta bancaria y período específico
 *     tags: [Banca]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: bank_account_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la cuenta bancaria
 *       - in: query
 *         name: period
 *         required: true
 *         schema:
 *           type: string
 *           example: "01/2026"
 *         description: Período en formato MM/YYYY
 *     responses:
 *       200:
 *         description: Reporte de conciliación
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       400:
 *         description: Cuenta bancaria y período requeridos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// GET /banking/reconciliation/report?period=MM/YYYY
router.get('/reconciliation/report', authenticate, async (req, res, next) => {
  try {
    const { bank_account_id, period } = req.query;
    if (!bank_account_id || !period) throw new AppError('Cuenta bancaria y período requeridos', 400);
    const report = await bankingService.getReconciliationReport(bank_account_id, period);
    res.json({ success: true, data: report });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /banking/api-config:
 *   get:
 *     summary: Obtener configuración de API bancaria
 *     description: Retorna la configuración actual de la API bancaria (clave enmascarada). Requiere rol admin o tesorero.
 *     tags: [Banca]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Configuración de API bancaria
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
 *                     bank_api_provider:
 *                       type: string
 *                     bank_api_url:
 *                       type: string
 *                     bank_api_key_masked:
 *                       type: string
 *                     bank_api_enabled:
 *                       type: string
 *                     is_configured:
 *                       type: boolean
 *       403:
 *         description: No autorizado (requiere rol admin o tesorero)
 */
// GET /banking/api-config
router.get('/api-config', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const configs = await db('config').whereIn('key', [
      'bank_api_provider', 'bank_api_url', 'bank_api_key', 'bank_api_enabled',
    ]);
    const data = {};
    configs.forEach((c) => { data[c.key] = c.value; });
    // Mask API key for display
    if (data.bank_api_key) {
      data.bank_api_key_masked = data.bank_api_key.slice(0, 6) + '****' + data.bank_api_key.slice(-4);
      delete data.bank_api_key;
    }
    data.is_configured = !!(data.bank_api_provider && data.bank_api_url);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /banking/api-config:
 *   put:
 *     summary: Actualizar configuración de API bancaria
 *     description: Actualiza la configuración de conexión a la API bancaria. Requiere rol admin.
 *     tags: [Banca]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               bank_api_provider:
 *                 type: string
 *                 description: Proveedor de la API bancaria
 *               bank_api_url:
 *                 type: string
 *                 description: URL de la API bancaria
 *               bank_api_key:
 *                 type: string
 *                 description: Clave de la API bancaria
 *               bank_api_enabled:
 *                 type: boolean
 *                 description: Habilitar/deshabilitar la API bancaria
 *     responses:
 *       200:
 *         description: Configuración actualizada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       403:
 *         description: No autorizado (requiere rol admin)
 */
// PUT /banking/api-config
router.put('/api-config', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { bank_api_provider, bank_api_url, bank_api_key, bank_api_enabled } = req.body;
    const allowedKeys = { bank_api_provider, bank_api_url, bank_api_key, bank_api_enabled: String(bank_api_enabled ?? 'false') };

    for (const [key, value] of Object.entries(allowedKeys)) {
      if (value === undefined) continue;
      const existing = await db('config').where({ key }).first();
      if (existing) {
        await db('config').where({ key }).update({ value: String(value), updated_at: new Date() });
      } else {
        await db('config').insert({ key, value: String(value), description: `Configuración API bancaria: ${key}` });
      }
    }

    await auditService.logAction(req.user.id, 'config', null, 'update', null, { bank_api_provider }, req.ip);
    res.json({ success: true, message: 'Configuración de API bancaria actualizada' });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /banking/sync:
 *   post:
 *     summary: Sincronizar movimientos desde API bancaria
 *     description: Obtiene movimientos bancarios desde la API del banco configurada. Requiere que la API esté habilitada y configurada.
 *     tags: [Banca]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Movimientos sincronizados exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       400:
 *         description: API bancaria no habilitada o configuración incompleta
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: No autorizado
 *       501:
 *         description: Integración con proveedor bancario no implementada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// POST /banking/sync - Fetch movements from bank API
router.post('/sync', authenticate, authorize('admin', 'tesorero', 'contador'), async (req, res, next) => {
  try {
    const enabled = await db('config').where({ key: 'bank_api_enabled' }).first();
    if (enabled?.value !== 'true') {
      throw new AppError('La API bancaria no está habilitada. Configure la conexión en Configuración > API Bancaria.', 400, 'BANK_API_NOT_CONFIGURED');
    }

    const provider = (await db('config').where({ key: 'bank_api_provider' }).first())?.value;
    const apiUrl = (await db('config').where({ key: 'bank_api_url' }).first())?.value;
    const apiKey = (await db('config').where({ key: 'bank_api_key' }).first())?.value;

    if (!provider || !apiUrl || !apiKey) {
      throw new AppError('Configuración de API bancaria incompleta. Verifique proveedor, URL y clave API.', 400, 'BANK_API_INCOMPLETE');
    }

    // Placeholder: when the bank provides the real API, implement the fetch here.
    // For now, return a clear message indicating the integration point.
    throw new AppError(
      `Integración con ${provider} pendiente. La conexión a ${apiUrl} está configurada pero el adaptador de ${provider} aún no está implementado. Contacte al desarrollador para activar la integración.`,
      501,
      'BANK_API_NOT_IMPLEMENTED'
    );
  } catch (err) { next(err); }
});

module.exports = router;
