/**
 * BFC Notifications: tabla para registrar notificaciones push del banco
 * + campos en bfc_config para credenciales del receptor (HMAC secret, IP whitelist).
 */
exports.up = async (knex) => {
  // Per-org notification credentials
  await knex.schema.alterTable('bfc_config', (t) => {
    t.text('notification_secret').nullable();
    t.text('notification_allowed_ips').nullable(); // CSV
  });

  await knex.schema.createTable('bfc_notifications', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('organization_id').nullable().references('id').inTable('organizations').onDelete('SET NULL');
    t.string('event_type', 100).nullable();
    t.string('account_number', 50).nullable();
    t.string('reference', 100).nullable();
    t.decimal('amount', 18, 2).nullable();
    t.string('currency', 10).nullable();
    t.jsonb('raw_payload').notNullable();
    t.jsonb('headers').nullable();
    t.string('source_ip', 45).nullable();
    t.boolean('signature_valid').notNullable().defaultTo(false);
    // received | processed | error | orphan | ignored
    t.string('status', 20).notNullable().defaultTo('received');
    t.uuid('bank_movement_id').nullable();
    t.text('error_message').nullable();
    t.timestamp('received_at').notNullable().defaultTo(knex.fn.now());
    t.index('organization_id');
    t.index('received_at');
    t.index('status');
    t.index(['account_number', 'reference']);
  });
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('bfc_notifications');
  await knex.schema.alterTable('bfc_config', (t) => {
    t.dropColumn('notification_secret');
    t.dropColumn('notification_allowed_ips');
  });
};
