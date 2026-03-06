/**
 * Add bank_account_id to treasury_cash_flows
 * Links cash flow movements to specific bank accounts
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('treasury_cash_flows', (t) => {
    t.uuid('bank_account_id').nullable().references('id').inTable('bank_accounts');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('treasury_cash_flows', (t) => {
    t.dropColumn('bank_account_id');
  });
};
