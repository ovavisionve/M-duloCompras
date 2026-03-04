/**
 * Migration: Add purchase_type and supplier_id to treasury_operations
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('treasury_operations', (t) => {
    t.string('purchase_type', 30).nullable().after('description');
    t.uuid('supplier_id').nullable().references('id').inTable('suppliers').after('supplier_name');
    t.decimal('purchase_rate', 18, 6).nullable().after('parallel_rate');
    t.decimal('diff_usd', 18, 2).nullable().after('exchange_difference');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('treasury_operations', (t) => {
    t.dropColumn('purchase_type');
    t.dropColumn('supplier_id');
    t.dropColumn('purchase_rate');
    t.dropColumn('diff_usd');
  });
};
