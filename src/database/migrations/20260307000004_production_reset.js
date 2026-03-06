/**
 * Full production reset: clean ALL transactional/demo data.
 * Keeps: users, config, expense_categories, cost_centers, withholding_rules, bank_accounts (empty).
 */
exports.up = async function (knex) {
  // Order matters due to FK constraints — clean child tables first

  // 1. Webhooks logs
  if (await knex.schema.hasTable('webhook_logs')) await knex('webhook_logs').del();

  // 2. Audit logs — clean ALL (fresh start)
  if (await knex.schema.hasTable('audit_logs')) await knex('audit_logs').del();

  // 3. Treasury
  if (await knex.schema.hasTable('treasury_cash_flows')) await knex('treasury_cash_flows').del();
  if (await knex.schema.hasTable('treasury_ledger')) await knex('treasury_ledger').del();
  if (await knex.schema.hasTable('treasury_operations')) await knex('treasury_operations').del();

  // 4. Banking
  if (await knex.schema.hasTable('bank_movements')) await knex('bank_movements').del();

  // 5. Payments
  if (await knex.schema.hasTable('payment_invoices')) await knex('payment_invoices').del();
  if (await knex.schema.hasTable('payments')) await knex('payments').del();

  // 6. Withholdings
  if (await knex.schema.hasTable('withholding_invoices')) await knex('withholding_invoices').del();
  if (await knex.schema.hasTable('withholdings')) await knex('withholdings').del();

  // 7. Purchase book
  if (await knex.schema.hasTable('purchase_books')) await knex('purchase_books').del();

  // 8. Invoices
  if (await knex.schema.hasTable('invoice_items')) await knex('invoice_items').del();
  if (await knex.schema.hasTable('invoices')) await knex('invoices').del();

  // 9. Suppliers
  if (await knex.schema.hasTable('suppliers')) await knex('suppliers').del();

  // 10. Exchange rates — only delete seed-generated fakes (source='manual' from seed)
  // Keep API-fetched rates (source='bcv_api', 'bcv_scrape', 'pydolarve', etc.)
  if (await knex.schema.hasTable('exchange_rates')) {
    await knex('exchange_rates').where({ source: 'manual' }).del();
  }

  // 11. Internal accounts (treasury)
  if (await knex.schema.hasTable('internal_accounts')) await knex('internal_accounts').del();
  if (await knex.schema.hasTable('cash_flows')) await knex('cash_flows').del();

  // 12. Reset bank account balances to 0
  if (await knex.schema.hasTable('bank_accounts')) {
    await knex('bank_accounts').update({ current_balance: 0, initial_balance: 0, updated_at: new Date() });
  }

  // 13. Reset withholding counters
  await knex('config').where({ key: 'withholding_counter_islr' }).update({ value: '0' });
  await knex('config').where({ key: 'withholding_counter_iva' }).update({ value: '0' });

  console.log('=== PRODUCTION RESET COMPLETE ===');
  console.log('Cleaned: suppliers, invoices, payments, withholdings, purchase_books,');
  console.log('         treasury, bank_movements, manual exchange_rates, audit_logs, webhook_logs');
  console.log('Kept: users, config, expense_categories, cost_centers, withholding_rules,');
  console.log('      bank_accounts (zeroed), exchange_rates from API (bcv_api, bcv_scrape, etc.)');
};

exports.down = async function () {
  // Irreversible — demo data cannot be restored
};
