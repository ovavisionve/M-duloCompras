const axios = require('axios');
const crypto = require('crypto');
const db = require('../database/connection');
const logger = require('../utils/logger');

async function emit(event, payload) {
  const subscriptions = await db('webhook_subscriptions')
    .where({ is_active: true })
    .whereRaw("? = ANY(events)", [event]);

  for (const sub of subscriptions) {
    const signature = crypto
      .createHmac('sha256', sub.secret)
      .update(JSON.stringify(payload))
      .digest('hex');

    try {
      const response = await axios.post(sub.url, { event, payload, timestamp: new Date().toISOString() }, {
        headers: { 'X-Webhook-Signature': signature, 'Content-Type': 'application/json' },
        timeout: parseInt(process.env.WEBHOOK_TIMEOUT || '5000'),
      });

      await db('webhook_logs').insert({
        subscription_id: sub.id,
        event,
        payload: JSON.stringify(payload),
        status_code: response.status,
        response_body: JSON.stringify(response.data).substring(0, 1000),
        success: true,
      });
    } catch (err) {
      logger.error(`Webhook failed for ${sub.url}: ${err.message}`);
      await db('webhook_logs').insert({
        subscription_id: sub.id,
        event,
        payload: JSON.stringify(payload),
        status_code: err.response?.status || null,
        response_body: err.message,
        success: false,
      });
    }
  }
}

module.exports = { emit };
