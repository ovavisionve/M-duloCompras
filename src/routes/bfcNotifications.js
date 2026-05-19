const express = require('express');
const router = express.Router();
const db = require('../database/connection');
const { authenticate, authorize } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const notificationService = require('../services/bfcNotificationService');

// ─── POST /api/v1/bfc/notifications (PUBLIC — BFC push receiver) ─────
//
// Recibe notificaciones push del banco. NO requiere JWT.
// Auth via:
//   - Header X-BFC-Signature (HMAC-SHA256 del raw body con notification_secret)
//   - IP whitelist (configurable por org en bfc_config.notification_allowed_ips
//     o global vía env BFC_NOTIFICATION_ALLOWED_IPS)
//
// Captura raw body (req.rawBody) configurada en app.js para verificar HMAC
// sin perder el cuerpo después del parseo JSON.
router.post('/', express.json({
  limit: '5mb',
  verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); },
}), async (req, res, next) => {
  try {
    const sourceIp = req.headers['x-forwarded-for']?.split(',')[0].trim()
      || req.socket?.remoteAddress
      || req.ip;

    // Filtro global de IP si está configurado por env
    const globalAllowed = process.env.BFC_NOTIFICATION_ALLOWED_IPS;
    if (globalAllowed && !notificationService.isIpAllowed(sourceIp, globalAllowed)) {
      logger.warn(`BFC notification rejected: IP ${sourceIp} not in global whitelist`);
      return res.status(403).json({ success: false, error: { code: 'IP_NOT_ALLOWED', message: 'IP origen no autorizada' } });
    }

    const payload = req.body || {};
    const headers = { ...req.headers };
    // Censurar headers sensibles antes de persistir
    delete headers.cookie;
    delete headers.authorization;

    const record = await notificationService.processNotification({
      rawBody: req.rawBody || '',
      payload,
      headers,
      sourceIp,
    });

    // Respuesta acorde al status del procesamiento.
    // El banco generalmente solo necesita un 200/202 para no reintentar.
    if (record.status === 'error') {
      return res.status(400).json({
        success: false,
        notification_id: record.id,
        error: { code: 'NOTIFICATION_REJECTED', message: record.error_message },
      });
    }

    return res.status(200).json({
      success: true,
      notification_id: record.id,
      status: record.status,
    });
  } catch (err) {
    logger.error('BFC notification handler error', err);
    next(err);
  }
});

// ─── GET /api/v1/bfc/notifications (auth) ────────────────────────────
// Lista de notificaciones recibidas, scopeadas a la organización del usuario.
router.get('/', authenticate, authorize('admin', 'tesorero', 'contador', 'auditor'), async (req, res, next) => {
  try {
    const { status, limit = 100 } = req.query;
    const q = db('bfc_notifications')
      .where({ organization_id: req.user.organizationId })
      .orderBy('received_at', 'desc')
      .limit(Math.min(parseInt(limit, 10) || 100, 500));
    if (status) q.where('status', status);

    const notifications = await q;
    res.json({ success: true, data: notifications });
  } catch (err) { next(err); }
});

// ─── GET /api/v1/bfc/notifications/:id ───────────────────────────────
// Detalle (incluye raw_payload y headers completos).
router.get('/:id', authenticate, authorize('admin', 'tesorero', 'contador', 'auditor'), async (req, res, next) => {
  try {
    const n = await db('bfc_notifications')
      .where({ id: req.params.id, organization_id: req.user.organizationId })
      .first();
    if (!n) throw new AppError('Notificación no encontrada', 404, 'NOT_FOUND');
    res.json({ success: true, data: n });
  } catch (err) { next(err); }
});

// ─── POST /api/v1/bfc/notifications/:id/retry ────────────────────────
// Reintenta procesar el payload original (útil cuando la cuenta o config
// se actualizan después de recibir una orphan).
router.post('/:id/retry', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const n = await db('bfc_notifications')
      .where({ id: req.params.id, organization_id: req.user.organizationId })
      .first();
    if (!n) throw new AppError('Notificación no encontrada', 404, 'NOT_FOUND');

    const newRecord = await notificationService.processNotification({
      rawBody: typeof n.raw_payload === 'string' ? n.raw_payload : JSON.stringify(n.raw_payload),
      payload: n.raw_payload,
      headers: n.headers || {},
      sourceIp: n.source_ip,
    });
    res.json({ success: true, data: newRecord });
  } catch (err) { next(err); }
});

module.exports = router;
