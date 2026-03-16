/**
 * Wave Accounting integration: config storage and sync log tracking.
 */
exports.up = async function (knex) {
  // Wave connection config per organization
  await knex.schema.createTable('wave_config', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    t.string('access_token', 500).nullable();
    t.string('business_id', 100).nullable();
    t.string('business_name', 200).nullable();
    t.boolean('is_active').defaultTo(false);
    t.boolean('sync_invoices').defaultTo(true);
    t.boolean('sync_suppliers').defaultTo(true);
    t.timestamps(true, true);
    t.unique(['organization_id']);
  });

  // Sync log for tracking Wave API calls
  await knex.schema.createTable('wave_sync_logs', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    t.string('entity_type', 50).notNullable(); // invoice, supplier, product, account
    t.string('direction', 10).notNullable(); // push, pull
    t.uuid('local_id').nullable();
    t.string('wave_id', 100).nullable();
    t.string('status', 20).notNullable().defaultTo('pending'); // pending, success, error
    t.text('error_message').nullable();
    t.jsonb('request_data').nullable();
    t.jsonb('response_data').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Track Wave IDs mapped to local entities
  await knex.schema.createTable('wave_entity_map', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    t.string('entity_type', 50).notNullable(); // invoice, supplier, product, account
    t.uuid('local_id').notNullable();
    t.string('wave_id', 100).notNullable();
    t.timestamp('last_synced_at').defaultTo(knex.fn.now());
    t.timestamps(true, true);
    t.unique(['organization_id', 'entity_type', 'local_id']);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('wave_entity_map');
  await knex.schema.dropTableIfExists('wave_sync_logs');
  await knex.schema.dropTableIfExists('wave_config');
};
