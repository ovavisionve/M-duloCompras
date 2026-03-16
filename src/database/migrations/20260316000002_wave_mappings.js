/**
 * Wave integration improvements: product mapping, account mapping, auto-sync config.
 */
exports.up = async function (knex) {
  // Product mapping: link Wave products to expense categories or free-text descriptions
  await knex.schema.createTable('wave_product_map', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    t.string('wave_product_id', 100).notNullable();
    t.string('wave_product_name', 200).nullable();
    t.uuid('expense_category_id').nullable().references('id').inTable('expense_categories').onDelete('SET NULL');
    t.string('local_description', 200).nullable(); // fallback description when no category
    t.boolean('is_default').defaultTo(false); // default product for new invoices
    t.timestamps(true, true);
    t.unique(['organization_id', 'wave_product_id']);
  });

  // Account mapping: link expense categories to Wave accounts
  await knex.schema.createTable('wave_account_map', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    t.uuid('expense_category_id').notNullable().references('id').inTable('expense_categories').onDelete('CASCADE');
    t.string('wave_account_id', 100).notNullable();
    t.string('wave_account_name', 200).nullable();
    t.timestamps(true, true);
    t.unique(['organization_id', 'expense_category_id']);
  });

  // Add auto-sync and default product to wave_config
  await knex.schema.alterTable('wave_config', (t) => {
    t.boolean('auto_sync').defaultTo(false);
    t.string('default_wave_product_id', 100).nullable();
    t.string('default_wave_product_name', 200).nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('wave_config', (t) => {
    t.dropColumn('auto_sync');
    t.dropColumn('default_wave_product_id');
    t.dropColumn('default_wave_product_name');
  });
  await knex.schema.dropTableIfExists('wave_account_map');
  await knex.schema.dropTableIfExists('wave_product_map');
};
