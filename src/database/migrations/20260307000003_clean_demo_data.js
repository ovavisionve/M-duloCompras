/**
 * Clean all demo/test data from treasury and banking tables.
 * This prepares the database for production use.
 */
exports.up = async function (knex) {
  // Clean treasury data
  if (await knex.schema.hasTable('treasury_cash_flows')) {
    await knex('treasury_cash_flows').del();
  }
  if (await knex.schema.hasTable('treasury_operations')) {
    await knex('treasury_operations').del();
  }
  if (await knex.schema.hasTable('treasury_ledger')) {
    await knex('treasury_ledger').del();
  }

  // Clean bank movements (test imports)
  if (await knex.schema.hasTable('bank_movements')) {
    await knex('bank_movements').del();
  }

  // Clean audit logs for treasury entities
  if (await knex.schema.hasTable('audit_logs')) {
    await knex('audit_logs')
      .whereIn('entity_type', ['treasury_operation', 'treasury_cash_flow', 'treasury_ledger', 'bank_movement'])
      .del();
  }

  console.log('Demo data cleaned: treasury_cash_flows, treasury_operations, treasury_ledger, bank_movements, related audit_logs');
};

exports.down = async function () {
  // Cannot restore deleted demo data
};
