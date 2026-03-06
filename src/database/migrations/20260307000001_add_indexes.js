/**
 * Add performance indexes to high-volume tables
 */
exports.up = async function (knex) {
  // Invoices
  await knex.schema.alterTable('invoices', (t) => {
    t.index(['supplier_id', 'fiscal_period'], 'idx_inv_supplier_period');
    t.index(['status', 'emission_date'], 'idx_inv_status_date');
    t.index(['fiscal_period'], 'idx_inv_period');
  });

  // Payments
  await knex.schema.alterTable('payments', (t) => {
    t.index(['payment_date', 'currency'], 'idx_pay_date_curr');
    t.index(['status'], 'idx_pay_status');
  });

  // Withholdings
  if (await knex.schema.hasTable('withholdings')) {
    await knex.schema.alterTable('withholdings', (t) => {
      t.index(['supplier_id', 'fiscal_period'], 'idx_with_supplier_period');
      t.index(['withholding_date'], 'idx_with_date');
    });
  }

  // Audit logs
  if (await knex.schema.hasTable('audit_logs')) {
    await knex.schema.alterTable('audit_logs', (t) => {
      t.index(['entity_type', 'entity_id'], 'idx_audit_entity');
      t.index(['created_at'], 'idx_audit_created');
    });
  }

  // Bank movements
  if (await knex.schema.hasTable('bank_movements')) {
    await knex.schema.alterTable('bank_movements', (t) => {
      t.index(['bank_account_id', 'movement_date'], 'idx_bm_account_date');
      t.index(['reconciliation_status'], 'idx_bm_recon_status');
    });
  }

  // Treasury operations
  if (await knex.schema.hasTable('treasury_operations')) {
    await knex.schema.alterTable('treasury_operations', (t) => {
      t.index(['operation_date', 'status'], 'idx_top_date_status');
    });
  }

  // Treasury cash flows
  if (await knex.schema.hasTable('treasury_cash_flows')) {
    await knex.schema.alterTable('treasury_cash_flows', (t) => {
      t.index(['flow_date', 'flow_type'], 'idx_tcf_date_type');
      t.index(['status'], 'idx_tcf_status');
    });
  }

  // Exchange rates
  await knex.schema.alterTable('exchange_rates', (t) => {
    t.index(['rate_date'], 'idx_er_date');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('invoices', (t) => {
    t.dropIndex([], 'idx_inv_supplier_period');
    t.dropIndex([], 'idx_inv_status_date');
    t.dropIndex([], 'idx_inv_period');
  });
  await knex.schema.alterTable('payments', (t) => {
    t.dropIndex([], 'idx_pay_date_curr');
    t.dropIndex([], 'idx_pay_status');
  });
  if (await knex.schema.hasTable('withholdings')) {
    await knex.schema.alterTable('withholdings', (t) => {
      t.dropIndex([], 'idx_with_supplier_period');
      t.dropIndex([], 'idx_with_date');
    });
  }
  if (await knex.schema.hasTable('audit_logs')) {
    await knex.schema.alterTable('audit_logs', (t) => {
      t.dropIndex([], 'idx_audit_entity');
      t.dropIndex([], 'idx_audit_created');
    });
  }
  if (await knex.schema.hasTable('bank_movements')) {
    await knex.schema.alterTable('bank_movements', (t) => {
      t.dropIndex([], 'idx_bm_account_date');
      t.dropIndex([], 'idx_bm_recon_status');
    });
  }
  if (await knex.schema.hasTable('treasury_operations')) {
    await knex.schema.alterTable('treasury_operations', (t) => {
      t.dropIndex([], 'idx_top_date_status');
    });
  }
  if (await knex.schema.hasTable('treasury_cash_flows')) {
    await knex.schema.alterTable('treasury_cash_flows', (t) => {
      t.dropIndex([], 'idx_tcf_date_type');
      t.dropIndex([], 'idx_tcf_status');
    });
  }
  await knex.schema.alterTable('exchange_rates', (t) => {
    t.dropIndex([], 'idx_er_date');
  });
};
