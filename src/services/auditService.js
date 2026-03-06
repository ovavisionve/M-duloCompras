const db = require('../database/connection');

// Entity types hidden from the audit log UI (internal/treasury operations)
const HIDDEN_ENTITY_TYPES = ['treasury_operation', 'treasury_cash_flow', 'treasury_ledger'];

async function logAction(userId, entityType, entityId, action, oldValues, newValues, ipAddress) {
  await db('audit_logs').insert({
    user_id: userId,
    entity_type: entityType,
    entity_id: entityId,
    action,
    old_values: oldValues ? JSON.stringify(oldValues) : null,
    new_values: newValues ? JSON.stringify(newValues) : null,
    ip_address: ipAddress,
  });
}

async function getAuditLogs(filters = {}) {
  const query = db('audit_logs')
    .leftJoin('users', 'audit_logs.user_id', 'users.id')
    .select('audit_logs.*', 'users.full_name as user_name', 'users.email as user_email')
    .whereNotIn('entity_type', HIDDEN_ENTITY_TYPES)
    .orderBy('audit_logs.created_at', 'desc');

  if (filters.entityType) query.where('entity_type', filters.entityType);
  if (filters.entityId) query.where('entity_id', filters.entityId);
  if (filters.userId) query.where('audit_logs.user_id', filters.userId);
  if (filters.action) query.where('action', filters.action);
  if (filters.from) query.where('audit_logs.created_at', '>=', filters.from);
  if (filters.to) query.where('audit_logs.created_at', '<=', filters.to);

  const page = filters.page || 1;
  const limit = filters.limit || 50;
  const offset = (page - 1) * limit;

  const [{ count }] = await query.clone().clearSelect().clearOrder().count();
  const data = await query.limit(limit).offset(offset);

  return { data, total: parseInt(count), page, limit };
}

module.exports = { logAction, getAuditLogs };
