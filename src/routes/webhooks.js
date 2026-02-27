const router = require('express').Router();
const crypto = require('crypto');
const db = require('../database/connection');
const { authenticate, authorize } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');

// GET /webhooks (list subscriptions)
router.get('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const subs = await db('webhook_subscriptions').orderBy('created_at', 'desc');
    res.json({ success: true, data: subs.map((s) => ({ ...s, secret: '***' })) });
  } catch (err) { next(err); }
});

// POST /webhooks (create subscription)
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

// DELETE /webhooks/:id
router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    await db('webhook_subscriptions').where({ id: req.params.id }).update({ is_active: false });
    res.json({ success: true, message: 'Webhook desactivado' });
  } catch (err) { next(err); }
});

// GET /webhooks/:id/logs
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
