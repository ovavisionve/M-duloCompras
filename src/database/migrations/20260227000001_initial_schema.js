/**
 * Migration: Initial Schema
 * Módulo de Compras, Gastos, Retenciones, Pagos y Libro de Compras
 * Normativa Fiscal Venezolana - SENIAT
 */
exports.up = async function (knex) {
  // ─── USERS & AUTH ───
  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('email', 150).notNullable().unique();
    t.string('password_hash', 255).notNullable();
    t.string('full_name', 150).notNullable();
    t.enum('role', ['admin', 'contador', 'tesorero', 'operador', 'auditor', 'api_consumer']).notNullable();
    t.boolean('is_active').defaultTo(true);
    t.boolean('mfa_enabled').defaultTo(false);
    t.string('mfa_secret', 255).nullable();
    t.timestamp('last_login').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('api_keys', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
    t.string('key_hash', 255).notNullable();
    t.string('name', 100).notNullable();
    t.specificType('scopes', 'text[]').notNullable();
    t.boolean('is_active').defaultTo(true);
    t.timestamp('expires_at').nullable();
    t.timestamps(true, true);
  });

  // ─── CONFIGURATION ───
  await knex.schema.createTable('config', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('key', 100).notNullable().unique();
    t.text('value').notNullable();
    t.string('description', 255).nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('expense_categories', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('name', 100).notNullable().unique();
    t.string('code', 20).notNullable().unique();
    t.text('description').nullable();
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('cost_centers', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('name', 100).notNullable().unique();
    t.string('code', 20).notNullable().unique();
    t.text('description').nullable();
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);
  });

  // ─── EXCHANGE RATES ───
  await knex.schema.createTable('exchange_rates', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.date('rate_date').notNullable().unique();
    t.decimal('rate', 18, 6).notNullable();
    t.enum('source', ['bcv_api', 'manual']).notNullable().defaultTo('bcv_api');
    t.uuid('created_by').nullable().references('id').inTable('users');
    t.timestamps(true, true);
  });

  // ─── SUPPLIERS ───
  await knex.schema.createTable('suppliers', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('rif', 15).notNullable().unique();
    t.string('business_name', 150).notNullable();
    t.text('fiscal_address').nullable();
    t.string('phone', 30).nullable();
    t.string('email', 150).nullable();
    t.enum('taxpayer_type', ['ordinario', 'especial', 'no_sujeto']).notNullable().defaultTo('ordinario');
    t.boolean('is_retention_agent').defaultTo(false);
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);
  });

  // ─── INVOICES ───
  await knex.schema.createTable('invoices', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('supplier_id').notNullable().references('id').inTable('suppliers');
    t.enum('document_type', ['FC', 'FG', 'ND', 'NC', 'DSF']).notNullable();
    t.string('invoice_number', 50).notNullable();
    t.string('control_number', 20).nullable();
    t.date('emission_date').notNullable();
    t.date('reception_date').notNullable();
    t.string('fiscal_period', 7).notNullable(); // MM/YYYY
    t.enum('currency', ['VES', 'USD']).notNullable();
    t.decimal('exchange_rate', 18, 6).notNullable();
    t.date('exchange_rate_date').notNullable();
    t.text('description').notNullable();
    t.uuid('expense_category_id').nullable().references('id').inTable('expense_categories');
    t.uuid('cost_center_id').nullable().references('id').inTable('cost_centers');
    t.decimal('taxable_amount', 18, 2).notNullable().defaultTo(0);
    t.decimal('exempt_amount', 18, 2).defaultTo(0);
    t.decimal('non_subject_amount', 18, 2).defaultTo(0);
    t.decimal('vat_rate', 5, 2).notNullable().defaultTo(16.00);
    t.decimal('vat_amount', 18, 2).notNullable().defaultTo(0);
    t.decimal('total_amount', 18, 2).notNullable();
    t.decimal('total_ves', 18, 2).notNullable();
    t.decimal('total_usd', 18, 2).notNullable();
    t.decimal('igtf_amount', 18, 2).defaultTo(0);
    t.enum('status', ['borrador', 'registrada', 'pago_parcial', 'pagada', 'anulada', 'en_disputa']).notNullable().defaultTo('borrador');
    t.uuid('related_invoice_id').nullable().references('id').inTable('invoices');
    t.string('attachment_path', 500).nullable();
    t.timestamps(true, true);

    t.unique(['supplier_id', 'invoice_number', 'control_number']);
  });

  await knex.schema.createTable('invoice_items', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('invoice_id').notNullable().references('id').inTable('invoices').onDelete('CASCADE');
    t.text('description').notNullable();
    t.decimal('quantity', 12, 4).notNullable().defaultTo(1);
    t.decimal('unit_price', 18, 2).notNullable();
    t.decimal('subtotal', 18, 2).notNullable();
    t.boolean('is_taxable').defaultTo(true);
    t.timestamps(true, true);
  });

  // ─── WITHHOLDING RULES ───
  await knex.schema.createTable('withholding_rules', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.enum('type', ['ISLR', 'IVA']).notNullable();
    t.string('concept_code', 20).notNullable();
    t.string('concept_name', 150).notNullable();
    t.decimal('rate', 5, 2).notNullable();
    t.decimal('subtract_ut', 8, 2).defaultTo(0);
    t.enum('applies_to', ['natural', 'juridica', 'ambos']).defaultTo('ambos');
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);
  });

  // ─── WITHHOLDINGS ───
  await knex.schema.createTable('withholdings', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('voucher_number', 20).notNullable().unique();
    t.enum('type', ['ISLR', 'IVA']).notNullable();
    t.uuid('supplier_id').notNullable().references('id').inTable('suppliers');
    t.uuid('withholding_rule_id').nullable().references('id').inTable('withholding_rules');
    t.date('withholding_date').notNullable();
    t.string('fiscal_period', 7).notNullable();
    t.decimal('base_amount', 18, 2).notNullable();
    t.decimal('rate', 5, 2).notNullable();
    t.decimal('amount_ves', 18, 2).notNullable();
    t.decimal('amount_usd', 18, 2).notNullable();
    t.decimal('exchange_rate', 18, 6).notNullable();
    t.enum('status', ['activa', 'anulada']).defaultTo('activa');
    t.text('void_reason').nullable();
    t.uuid('created_by').nullable().references('id').inTable('users');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('withholding_invoices', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('withholding_id').notNullable().references('id').inTable('withholdings').onDelete('CASCADE');
    t.uuid('invoice_id').notNullable().references('id').inTable('invoices');
    t.decimal('base_amount', 18, 2).notNullable();
    t.decimal('withheld_amount', 18, 2).notNullable();
  });

  // ─── BANK ACCOUNTS ───
  await knex.schema.createTable('bank_accounts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('bank_name', 100).notNullable();
    t.enum('account_type', ['corriente', 'ahorro', 'juridica']).notNullable();
    t.string('account_number', 20).notNullable().unique();
    t.enum('currency', ['VES', 'USD']).notNullable();
    t.decimal('initial_balance', 18, 2).defaultTo(0);
    t.decimal('current_balance', 18, 2).defaultTo(0);
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);
  });

  // ─── PAYMENTS ───
  await knex.schema.createTable('payments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.date('payment_date').notNullable();
    t.enum('payment_method', [
      'transferencia', 'pago_movil', 'efectivo_ves', 'efectivo_usd',
      'zelle', 'tarjeta', 'cheque', 'cripto', 'paypal'
    ]).notNullable();
    t.uuid('sender_bank_id').nullable().references('id').inTable('bank_accounts');
    t.uuid('receiver_bank_id').nullable().references('id').inTable('bank_accounts');
    t.string('reference_number', 100).nullable();
    t.enum('currency', ['VES', 'USD']).notNullable();
    t.decimal('amount', 18, 2).notNullable();
    t.decimal('exchange_rate', 18, 6).notNullable();
    t.decimal('amount_other_currency', 18, 2).notNullable();
    t.decimal('exchange_difference', 18, 2).defaultTo(0);
    t.decimal('islr_withheld', 18, 2).defaultTo(0);
    t.decimal('iva_withheld', 18, 2).defaultTo(0);
    t.string('attachment_path', 500).nullable();
    t.text('observations').nullable();
    t.enum('status', ['activo', 'anulado']).defaultTo('activo');
    t.text('void_reason').nullable();
    t.uuid('created_by').nullable().references('id').inTable('users');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('payment_invoices', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('payment_id').notNullable().references('id').inTable('payments').onDelete('CASCADE');
    t.uuid('invoice_id').notNullable().references('id').inTable('invoices');
    t.decimal('amount_applied', 18, 2).notNullable();
  });

  // ─── BANK MOVEMENTS ───
  await knex.schema.createTable('bank_movements', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('bank_account_id').notNullable().references('id').inTable('bank_accounts').onDelete('CASCADE');
    t.date('movement_date').notNullable();
    t.string('reference', 100).nullable();
    t.text('description').nullable();
    t.decimal('debit', 18, 2).defaultTo(0);
    t.decimal('credit', 18, 2).defaultTo(0);
    t.decimal('balance', 18, 2).nullable();
    t.uuid('matched_payment_id').nullable().references('id').inTable('payments');
    t.enum('reconciliation_status', ['pendiente', 'conciliado', 'no_identificado']).defaultTo('pendiente');
    t.timestamps(true, true);
  });

  // ─── PURCHASE BOOK ───
  await knex.schema.createTable('purchase_books', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('fiscal_period', 7).notNullable().unique();
    t.enum('status', ['abierto', 'cerrado']).defaultTo('abierto');
    t.decimal('total_taxable', 18, 2).defaultTo(0);
    t.decimal('total_exempt', 18, 2).defaultTo(0);
    t.decimal('total_vat', 18, 2).defaultTo(0);
    t.decimal('total_vat_withheld', 18, 2).defaultTo(0);
    t.decimal('grand_total', 18, 2).defaultTo(0);
    t.uuid('closed_by').nullable().references('id').inTable('users');
    t.timestamp('closed_at').nullable();
    t.timestamps(true, true);
  });

  // ─── AUDIT LOG ───
  await knex.schema.createTable('audit_logs', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').nullable().references('id').inTable('users');
    t.string('entity_type', 50).notNullable();
    t.uuid('entity_id').notNullable();
    t.enum('action', ['create', 'update', 'delete', 'void', 'status_change', 'login']).notNullable();
    t.jsonb('old_values').nullable();
    t.jsonb('new_values').nullable();
    t.string('ip_address', 45).nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // ─── WEBHOOK SUBSCRIPTIONS ───
  await knex.schema.createTable('webhook_subscriptions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('url', 500).notNullable();
    t.specificType('events', 'text[]').notNullable();
    t.string('secret', 255).notNullable();
    t.boolean('is_active').defaultTo(true);
    t.uuid('created_by').references('id').inTable('users');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('webhook_logs', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('subscription_id').references('id').inTable('webhook_subscriptions');
    t.string('event', 50).notNullable();
    t.jsonb('payload').notNullable();
    t.integer('status_code').nullable();
    t.text('response_body').nullable();
    t.boolean('success').defaultTo(false);
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  const tables = [
    'webhook_logs', 'webhook_subscriptions', 'audit_logs', 'purchase_books',
    'bank_movements', 'payment_invoices', 'payments', 'withholding_invoices',
    'withholdings', 'withholding_rules', 'invoice_items', 'invoices',
    'suppliers', 'exchange_rates', 'cost_centers', 'expense_categories',
    'config', 'api_keys', 'users', 'bank_accounts',
  ];
  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }
};
