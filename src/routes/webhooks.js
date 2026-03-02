const router = require('express').Router();
const crypto = require('crypto');
const db = require('../database/connection');
const { authenticate, authorize } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');

/**
 * @swagger
 * /webhooks:
 *   get:
 *     summary: Listar suscripciones de webhooks
 *     tags: [Webhooks]
 *     description: Retorna todas las suscripciones de webhooks. El campo secret se enmascara por seguridad.
 *     responses:
 *       200:
 *         description: Lista de suscripciones de webhooks
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
 *                     $ref: '#/components/schemas/WebhookSubscription'
 *       401:
 *         description: No autenticado
 *       403:
 *         description: No autorizado (requiere rol admin)
 */
router.get('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const subs = await db('webhook_subscriptions').orderBy('created_at', 'desc');
    res.json({ success: true, data: subs.map((s) => ({ ...s, secret: '***' })) });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /webhooks:
 *   post:
 *     summary: Crear suscripción de webhook
 *     tags: [Webhooks]
 *     description: Crea una nueva suscripción. El secret se genera automáticamente y solo se muestra en la respuesta de creación.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [url, events]
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *                 description: URL de destino del webhook
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum:
 *                     - invoice.created
 *                     - invoice.status_changed
 *                     - payment.registered
 *                     - withholding.generated
 *                     - purchase_book.closed
 *                     - exchange_rate.updated
 *                 description: Eventos a los que se suscribe
 *     responses:
 *       201:
 *         description: Suscripción creada exitosamente (incluye secret)
 *       400:
 *         description: URL y eventos requeridos o eventos inválidos
 *       401:
 *         description: No autenticado
 *       403:
 *         description: No autorizado (requiere rol admin)
 */
router.post('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { url, events } = req.body;
    if (!url || !events?.length) throw new AppError('URL y eventos requeridos', 400);

    const validEvents = [
      'invoice.created', 'invoice.status_changed', 'payment.registered',
      'withholding.generated', 'purchase_book.closed', 'exchange_rate.updated',
    ];
    const invalidEvents = events.filter((e) => !validEvents.includes(e));
    if (invalidEvents.length) throw new AppError(`Eventos inválidos: ${invalidEvents.join(', ')}`, 400);

    const secret = crypto.randomBytes(32).toString('hex');

    const [sub] = await db('webhook_subscriptions').insert({
      url, events, secret, created_by: req.user.id,
    }).returning('*');

    res.status(201).json({ success: true, data: { ...sub, secret } }); // Show secret only on creation
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /webhooks/{id}:
 *   delete:
 *     summary: Desactivar suscripción de webhook
 *     tags: [Webhooks]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la suscripción de webhook
 *     responses:
 *       200:
 *         description: Webhook desactivado
 *       401:
 *         description: No autenticado
 *       403:
 *         description: No autorizado (requiere rol admin)
 */
router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    await db('webhook_subscriptions').where({ id: req.params.id }).update({ is_active: false });
    res.json({ success: true, message: 'Webhook desactivado' });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /webhooks/{id}/logs:
 *   get:
 *     summary: Obtener logs de un webhook
 *     tags: [Webhooks]
 *     description: Retorna los últimos 50 registros de envío del webhook especificado
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la suscripción de webhook
 *     responses:
 *       200:
 *         description: Lista de logs del webhook
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
 *                     $ref: '#/components/schemas/WebhookLog'
 *       401:
 *         description: No autenticado
 *       403:
 *         description: No autorizado (requiere rol admin)
 */
router.get('/:id/logs', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const logs = await db('webhook_logs')
      .where({ subscription_id: req.params.id })
      .orderBy('created_at', 'desc')
      .limit(50);
    res.json({ success: true, data: logs });
  } catch (err) { next(err); }
});

module.exports = router;
