/**
 * Migration: Treasury Operations (Internal FX Module)
 * Registro interno de operaciones de compra de divisas
 * Este módulo NO es visible en reportes fiscales (SENIAT)
 */
exports.up = async function (knex) {
  // ─── Internal accounts for treasury tracking ───
  await knex.schema.createTable('internal_accounts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('code', 20).notNullable().unique();
    t.string('name', 100).notNullable();
    t.enum('type', ['activo', 'pasivo', 'ingreso', 'gasto']).notNullable();
    t.enum('currency', ['VES', 'USD']).defaultTo('VES');
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);
  });

  // ─── Treasury operations: each FX purchase cycle ───
  await knex.schema.createTable('treasury_operations', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.date('operation_date').notNullable();
    t.text('description').nullable();

    // Step 1: VES out (money leaves company to buy USD)
    t.decimal('amount_ves', 18, 2).notNullable();
    t.uuid('source_bank_account_id').nullable().references('id').inTable('bank_accounts');

    // Step 2: USD received
    t.decimal('amount_usd', 18, 2).nullable();
    t.decimal('parallel_rate', 18, 6).nullable(); // actual rate paid (manual)
    t.enum('destination_type', ['banco_usd', 'caja_usd']).defaultTo('banco_usd');
    t.uuid('destination_bank_account_id').nullable().references('id').inTable('bank_accounts');

    // Reference rates
    t.decimal('bcv_rate', 18, 6).nullable(); // official BCV rate that day

    // Result
    t.decimal('exchange_difference', 18, 2).nullable(); // gain or loss in VES

    // Link to payment/invoice
    t.uuid('payment_id').nullable().references('id').inTable('payments');
    t.uuid('invoice_id').nullable().references('id').inTable('invoices');
    t.string('supplier_name', 200).nullable();

    // Status
    t.enum('status', ['pendiente', 'usd_recibido', 'completada', 'anulada']).defaultTo('pendiente');
    t.text('notes').nullable();

    t.uuid('created_by').references('id').inTable('users');
    t.timestamps(true, true);
  });

  // ─── Ledger entries for double-entry tracking ───
  await knex.schema.createTable('treasury_ledger', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('operation_id').notNullable().references('id').inTable('treasury_operations').onDelete('CASCADE');
    t.uuid('account_id').notNullable().references('id').inTable('internal_accounts');
    t.enum('movement_type', ['debito', 'credito']).notNullable();
    t.decimal('amount', 18, 2).notNullable();
    t.enum('currency', ['VES', 'USD']).notNullable();
    t.text('description').nullable();
    t.date('movement_date').notNullable();
    t.timestamps(true, true);
  });

  // ─── Seed internal accounts ───
  await knex('internal_accounts').insert([
    { code: 'BANCO_VES', name: 'Banco VES (Salida)', type: 'activo', currency: 'VES' },
    { code: 'BANCO_USD', name: 'Banco USD (Entrada)', type: 'activo', currency: 'USD' },
    { code: 'CAJA_USD', name: 'Caja USD', type: 'activo', currency: 'USD' },
    { code: 'PREST_ACC', name: 'Préstamos Accionistas', type: 'pasivo', currency: 'VES' },
    { code: 'GAN_CAMB', name: 'Ganancia Cambiaria', type: 'ingreso', currency: 'VES' },
    { code: 'PERD_CAMB', name: 'Pérdida Cambiaria', type: 'gasto', currency: 'VES' },
  ]);
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('treasury_ledger');
  await knex.schema.dropTableIfExists('treasury_operations');
  await knex.schema.dropTableIfExists('internal_accounts');
};
