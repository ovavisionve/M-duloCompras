const bcrypt = require('bcryptjs');

/**
 * Multi-tenancy: Add organizations table and organization_id to all tenant-scoped tables.
 * Shared (global) tables: exchange_rates, withholding_rules, webhook_subscriptions, webhook_logs
 */
exports.up = async function (knex) {
  // ─── 1. CREATE ORGANIZATIONS TABLE ───
  await knex.schema.createTable('organizations', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('name', 200).notNullable();
    t.string('slug', 100).notNullable().unique();
    t.string('rif', 15).nullable();
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);
  });

  // ─── 2. SEED ORGANIZATIONS ───
  const [weflyOrg] = await knex('organizations').insert({
    name: 'WEFLY2022 C.A.',
    slug: 'wefly',
    rif: 'J-503159952',
  }).returning('*');

  const [demoOrg] = await knex('organizations').insert({
    name: 'Empresa Demo S.A.',
    slug: 'demo',
  }).returning('*');

  // ─── 3. ADD organization_id TO USERS ───
  await knex.schema.alterTable('users', (t) => {
    t.uuid('organization_id').nullable().references('id').inTable('organizations');
  });
  // Assign WEFLY users
  await knex('users').whereNot('email', 'like', '%@compraria.com').update({ organization_id: weflyOrg.id });
  // Assign demo users
  await knex('users').where('email', 'like', '%@compraria.com').update({ organization_id: demoOrg.id });

  // ─── 4. ADD organization_id TO TENANT-SCOPED TABLES ───
  const tenantTables = [
    'suppliers', 'invoices', 'payments', 'withholdings',
    'bank_accounts', 'purchase_books', 'audit_logs',
  ];

  for (const table of tenantTables) {
    if (await knex.schema.hasTable(table)) {
      await knex.schema.alterTable(table, (t) => {
        t.uuid('organization_id').nullable().references('id').inTable('organizations');
      });
      await knex(table).whereNull('organization_id').update({ organization_id: weflyOrg.id });
    }
  }

  // Tables that may or may not exist (treasury)
  const optionalTables = [
    'treasury_operations', 'treasury_cash_flows', 'internal_accounts',
  ];
  for (const table of optionalTables) {
    if (await knex.schema.hasTable(table)) {
      const hasCol = await knex.schema.hasColumn(table, 'organization_id');
      if (!hasCol) {
        await knex.schema.alterTable(table, (t) => {
          t.uuid('organization_id').nullable().references('id').inTable('organizations');
        });
        await knex(table).whereNull('organization_id').update({ organization_id: weflyOrg.id });
      }
    }
  }

  // Config, expense_categories, cost_centers need special handling (UNIQUE constraints)
  await knex.schema.alterTable('config', (t) => {
    t.uuid('organization_id').nullable().references('id').inTable('organizations');
  });
  await knex('config').whereNull('organization_id').update({ organization_id: weflyOrg.id });

  await knex.schema.alterTable('expense_categories', (t) => {
    t.uuid('organization_id').nullable().references('id').inTable('organizations');
  });
  await knex('expense_categories').whereNull('organization_id').update({ organization_id: weflyOrg.id });

  await knex.schema.alterTable('cost_centers', (t) => {
    t.uuid('organization_id').nullable().references('id').inTable('organizations');
  });
  await knex('cost_centers').whereNull('organization_id').update({ organization_id: weflyOrg.id });

  // ─── 5. UPDATE UNIQUE CONSTRAINTS TO BE COMPOSITE ───

  // suppliers: rif unique -> (organization_id, rif)
  await knex.schema.alterTable('suppliers', (t) => {
    t.dropUnique(['rif']);
    t.unique(['organization_id', 'rif']);
  });

  // config: key unique -> (organization_id, key)
  await knex.schema.alterTable('config', (t) => {
    t.dropUnique(['key']);
    t.unique(['organization_id', 'key']);
  });

  // expense_categories: name/code unique -> (org, name), (org, code)
  await knex.schema.alterTable('expense_categories', (t) => {
    t.dropUnique(['name']);
    t.dropUnique(['code']);
    t.unique(['organization_id', 'name']);
    t.unique(['organization_id', 'code']);
  });

  // cost_centers: name/code unique -> (org, name), (org, code)
  await knex.schema.alterTable('cost_centers', (t) => {
    t.dropUnique(['name']);
    t.dropUnique(['code']);
    t.unique(['organization_id', 'name']);
    t.unique(['organization_id', 'code']);
  });

  // purchase_books: fiscal_period unique -> (org, fiscal_period)
  await knex.schema.alterTable('purchase_books', (t) => {
    t.dropUnique(['fiscal_period']);
    t.unique(['organization_id', 'fiscal_period']);
  });

  // ─── 6. DUPLICATE CONFIG FOR DEMO ORG ───
  const weflyConfigs = await knex('config').where({ organization_id: weflyOrg.id });
  for (const cfg of weflyConfigs) {
    let value = cfg.value;
    if (cfg.key === 'company_name') value = 'Empresa Demo S.A.';
    if (cfg.key === 'company_rif') value = 'J-000000000';
    if (cfg.key === 'company_address') value = 'Av. Principal, Centro Empresarial Demo, Caracas';
    await knex('config').insert({
      key: cfg.key,
      value,
      description: cfg.description,
      organization_id: demoOrg.id,
    });
  }

  // Duplicate expense categories for demo org
  const cats = await knex('expense_categories').where({ organization_id: weflyOrg.id });
  for (const cat of cats) {
    await knex('expense_categories').insert({
      name: cat.name, code: cat.code, description: cat.description,
      is_active: cat.is_active, organization_id: demoOrg.id,
    });
  }

  // Duplicate cost centers for demo org
  const ccs = await knex('cost_centers').where({ organization_id: weflyOrg.id });
  for (const cc of ccs) {
    await knex('cost_centers').insert({
      name: cc.name, code: cc.code, description: cc.description,
      is_active: cc.is_active, organization_id: demoOrg.id,
    });
  }

  // ─── 7. DEMO SAMPLE DATA ───
  // Demo bank accounts
  await knex('bank_accounts').insert([
    { bank_name: 'Banco Nacional de Crédito', account_type: 'corriente', account_number: '01910000000000000001', currency: 'VES', initial_balance: 250000, current_balance: 250000, organization_id: demoOrg.id },
    { bank_name: 'Bank of America', account_type: 'corriente', account_number: 'BOA-USD-001', currency: 'USD', initial_balance: 15000, current_balance: 15000, organization_id: demoOrg.id },
  ]);

  // Demo suppliers
  const [sup1] = await knex('suppliers').insert({
    rif: 'J-123456789', business_name: 'Tecnología Global C.A.',
    fiscal_address: 'Caracas, Venezuela', phone: '0212-1234567',
    email: 'admin@tecglobal.com', taxpayer_type: 'ordinario',
    organization_id: demoOrg.id,
  }).returning('*');

  const [sup2] = await knex('suppliers').insert({
    rif: 'J-987654321', business_name: 'Servicios Administrativos VE S.A.',
    fiscal_address: 'Valencia, Venezuela', phone: '0241-9876543',
    email: 'contacto@servadmin.com', taxpayer_type: 'especial', is_retention_agent: true,
    organization_id: demoOrg.id,
  }).returning('*');

  const [sup3] = await knex('suppliers').insert({
    rif: 'V-12345678-0', business_name: 'María González (Consultora)',
    fiscal_address: 'Maracaibo, Venezuela',
    taxpayer_type: 'ordinario',
    organization_id: demoOrg.id,
  }).returning('*');

  // Demo invoices
  const demoCategories = await knex('expense_categories').where({ organization_id: demoOrg.id });
  const demoCostCenters = await knex('cost_centers').where({ organization_id: demoOrg.id });
  const catTec = demoCategories.find((c) => c.code === 'SER-TEC');
  const catAlq = demoCategories.find((c) => c.code === 'ALQ');
  const catPro = demoCategories.find((c) => c.code === 'SER-PRO');
  const ccAdm = demoCostCenters.find((c) => c.code === 'ADM');
  const ccTec = demoCostCenters.find((c) => c.code === 'TEC');

  const invoices = [
    {
      supplier_id: sup1.id, document_type: 'FAC', invoice_number: '00001234',
      control_number: '00-00001234', emission_date: '2026-03-01', reception_date: '2026-03-02',
      fiscal_period: '03/2026', currency: 'USD', exchange_rate: 78.50,
      taxable_amount: 500, exempt_amount: 0, non_subject_amount: 0,
      vat_rate: 16, vat_amount: 80, igtf_amount: 0,
      total_amount: 580, total_ves: 45530, total_usd: 580,
      status: 'registrada', expense_category_id: catTec?.id, cost_center_id: ccTec?.id,
      organization_id: demoOrg.id,
    },
    {
      supplier_id: sup2.id, document_type: 'FAC', invoice_number: 'A-0045',
      control_number: '00-00009876', emission_date: '2026-02-15', reception_date: '2026-02-16',
      fiscal_period: '02/2026', currency: 'VES', exchange_rate: 77.80,
      taxable_amount: 12000, exempt_amount: 3000, non_subject_amount: 0,
      vat_rate: 16, vat_amount: 1920, igtf_amount: 0,
      total_amount: 16920, total_ves: 16920, total_usd: 217.48,
      status: 'pagada', expense_category_id: catAlq?.id, cost_center_id: ccAdm?.id,
      organization_id: demoOrg.id,
    },
    {
      supplier_id: sup3.id, document_type: 'FAC', invoice_number: '0001',
      control_number: '00-00000001', emission_date: '2026-03-05', reception_date: '2026-03-06',
      fiscal_period: '03/2026', currency: 'VES', exchange_rate: 78.50,
      taxable_amount: 8000, exempt_amount: 0, non_subject_amount: 0,
      vat_rate: 16, vat_amount: 1280, igtf_amount: 0,
      total_amount: 9280, total_ves: 9280, total_usd: 118.22,
      status: 'registrada', expense_category_id: catPro?.id, cost_center_id: ccAdm?.id,
      organization_id: demoOrg.id,
    },
  ];
  await knex('invoices').insert(invoices);

  console.log('Multi-tenancy migration complete.');
  console.log(`Organizations: ${weflyOrg.name} (${weflyOrg.id}), ${demoOrg.name} (${demoOrg.id})`);
};

exports.down = async function (knex) {
  // Revert unique constraints
  const hasOrgs = await knex.schema.hasTable('organizations');
  if (!hasOrgs) return;

  // Drop composite unique constraints and restore originals
  try {
    await knex.schema.alterTable('suppliers', (t) => {
      t.dropUnique(['organization_id', 'rif']);
      t.unique(['rif']);
    });
    await knex.schema.alterTable('config', (t) => {
      t.dropUnique(['organization_id', 'key']);
      t.unique(['key']);
    });
    await knex.schema.alterTable('expense_categories', (t) => {
      t.dropUnique(['organization_id', 'name']);
      t.dropUnique(['organization_id', 'code']);
      t.unique(['name']);
      t.unique(['code']);
    });
    await knex.schema.alterTable('cost_centers', (t) => {
      t.dropUnique(['organization_id', 'name']);
      t.dropUnique(['organization_id', 'code']);
      t.unique(['name']);
      t.unique(['code']);
    });
    await knex.schema.alterTable('purchase_books', (t) => {
      t.dropUnique(['organization_id', 'fiscal_period']);
      t.unique(['fiscal_period']);
    });
  } catch (e) { /* ignore */ }

  // Drop organization_id columns
  const tables = [
    'users', 'suppliers', 'invoices', 'payments', 'withholdings',
    'bank_accounts', 'purchase_books', 'audit_logs', 'config',
    'expense_categories', 'cost_centers',
    'treasury_operations', 'treasury_cash_flows', 'internal_accounts',
  ];
  for (const table of tables) {
    if (await knex.schema.hasTable(table) && await knex.schema.hasColumn(table, 'organization_id')) {
      await knex.schema.alterTable(table, (t) => {
        t.dropColumn('organization_id');
      });
    }
  }

  // Delete demo data (cascades will handle child records)
  await knex.schema.dropTableIfExists('organizations');
};
