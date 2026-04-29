exports.up = async function (knex) {
  await knex.schema.createTable('bfc_config', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    t.string('base_url').notNullable();
    t.string('username').notNullable();
    t.text('password_encrypted').notNullable();
    t.string('cedula').notNullable();
    t.boolean('is_active').defaultTo(true);
    t.boolean('auto_import').defaultTo(false);
    t.timestamps(true, true);
    t.unique(['organization_id']);
  });

  await knex.schema.createTable('bfc_accounts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('bfc_config_id').notNullable().references('id').inTable('bfc_config').onDelete('CASCADE');
    t.uuid('bank_account_id').references('id').inTable('bank_accounts').onDelete('SET NULL');
    t.string('account_number').notNullable();
    t.string('account_alias');
    t.boolean('is_active').defaultTo(true);
    t.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    t.timestamps(true, true);
    t.unique(['bfc_config_id', 'account_number']);
  });

  await knex.schema.createTable('bfc_tokens', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    t.text('token').notNullable();
    t.timestamp('expires_at').notNullable();
    t.timestamps(true, true);
    t.unique(['organization_id']);
  });

  await knex.schema.createTable('bfc_sync_logs', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    t.string('account_number');
    t.string('action').notNullable();
    t.string('status').notNullable().defaultTo('pending');
    t.integer('records_fetched').defaultTo(0);
    t.integer('records_imported').defaultTo(0);
    t.text('error_message');
    t.jsonb('metadata');
    t.timestamps(true, true);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('bfc_sync_logs');
  await knex.schema.dropTableIfExists('bfc_tokens');
  await knex.schema.dropTableIfExists('bfc_accounts');
  await knex.schema.dropTableIfExists('bfc_config');
};
