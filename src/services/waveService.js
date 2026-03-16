const axios = require('axios');
const db = require('../database/connection');
const logger = require('../utils/logger');

const WAVE_GRAPHQL_URL = 'https://gql.waveapps.com/graphql/public';

// ─── GRAPHQL CLIENT ───────────────────────────────────────────────

async function waveQuery(accessToken, query, variables = {}) {
  const response = await axios.post(
    WAVE_GRAPHQL_URL,
    { query, variables },
    {
      timeout: 20000,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (response.data.errors) {
    const msg = response.data.errors.map((e) => e.message).join('; ');
    throw new Error(`Wave API error: ${msg}`);
  }

  return response.data.data;
}

// ─── CONFIG HELPERS ───────────────────────────────────────────────

async function getConfig(orgId) {
  return db('wave_config').where({ organization_id: orgId }).first();
}

async function saveConfig(orgId, data) {
  const existing = await getConfig(orgId);
  const fields = [
    'access_token', 'business_id', 'business_name', 'is_active',
    'sync_invoices', 'sync_suppliers', 'auto_sync',
    'default_wave_product_id', 'default_wave_product_name',
  ];
  if (existing) {
    const update = { updated_at: new Date() };
    for (const f of fields) {
      if (data[f] !== undefined) update[f] = data[f];
    }
    await db('wave_config').where({ id: existing.id }).update(update);
    return getConfig(orgId);
  }
  const insert = { organization_id: orgId };
  for (const f of fields) {
    if (data[f] !== undefined) insert[f] = data[f];
  }
  const [inserted] = await db('wave_config').insert(insert).returning('*');
  return inserted;
}

async function deleteConfig(orgId) {
  await db('wave_config').where({ organization_id: orgId }).del();
}

// ─── SYNC LOG ─────────────────────────────────────────────────────

async function logSync(orgId, entityType, direction, localId, waveId, status, errorMsg, reqData, resData) {
  await db('wave_sync_logs').insert({
    organization_id: orgId,
    entity_type: entityType,
    direction,
    local_id: localId || null,
    wave_id: waveId || null,
    status,
    error_message: errorMsg || null,
    request_data: reqData ? JSON.stringify(reqData) : null,
    response_data: resData ? JSON.stringify(resData) : null,
  });
}

async function getSyncLogs(orgId, filters = {}) {
  const query = db('wave_sync_logs')
    .where({ organization_id: orgId })
    .orderBy('created_at', 'desc');
  if (filters.entity_type) query.where('entity_type', filters.entity_type);
  if (filters.status) query.where('status', filters.status);
  if (filters.direction) query.where('direction', filters.direction);
  const limit = parseInt(filters.limit) || 50;
  return query.limit(limit);
}

// ─── ENTITY MAP ───────────────────────────────────────────────────

async function getWaveId(orgId, entityType, localId) {
  const map = await db('wave_entity_map')
    .where({ organization_id: orgId, entity_type: entityType, local_id: localId })
    .first();
  return map?.wave_id || null;
}

async function getLocalId(orgId, entityType, waveId) {
  const map = await db('wave_entity_map')
    .where({ organization_id: orgId, entity_type: entityType, wave_id: waveId })
    .first();
  return map?.local_id || null;
}

async function setWaveId(orgId, entityType, localId, waveId) {
  const existing = await db('wave_entity_map')
    .where({ organization_id: orgId, entity_type: entityType, local_id: localId })
    .first();
  if (existing) {
    await db('wave_entity_map').where({ id: existing.id }).update({
      wave_id: waveId,
      last_synced_at: new Date(),
      updated_at: new Date(),
    });
  } else {
    await db('wave_entity_map').insert({
      organization_id: orgId,
      entity_type: entityType,
      local_id: localId,
      wave_id: waveId,
    });
  }
}

async function getAllMappings(orgId, entityType) {
  return db('wave_entity_map')
    .where({ organization_id: orgId, entity_type: entityType });
}

// ─── PRODUCT MAPPING ─────────────────────────────────────────────

async function getProductMappings(orgId) {
  return db('wave_product_map')
    .leftJoin('expense_categories', 'wave_product_map.expense_category_id', 'expense_categories.id')
    .where('wave_product_map.organization_id', orgId)
    .select('wave_product_map.*', 'expense_categories.name as category_name');
}

async function saveProductMapping(orgId, data) {
  const existing = await db('wave_product_map')
    .where({ organization_id: orgId, wave_product_id: data.wave_product_id })
    .first();
  if (existing) {
    await db('wave_product_map').where({ id: existing.id }).update({
      wave_product_name: data.wave_product_name,
      expense_category_id: data.expense_category_id || null,
      local_description: data.local_description || null,
      is_default: data.is_default || false,
      updated_at: new Date(),
    });
    return db('wave_product_map').where({ id: existing.id }).first();
  }
  const [inserted] = await db('wave_product_map').insert({
    organization_id: orgId, ...data,
  }).returning('*');
  return inserted;
}

async function deleteProductMapping(orgId, mappingId) {
  return db('wave_product_map').where({ id: mappingId, organization_id: orgId }).del();
}

// ─── ACCOUNT MAPPING ─────────────────────────────────────────────

async function getAccountMappings(orgId) {
  return db('wave_account_map')
    .join('expense_categories', 'wave_account_map.expense_category_id', 'expense_categories.id')
    .where('wave_account_map.organization_id', orgId)
    .select('wave_account_map.*', 'expense_categories.name as category_name');
}

async function saveAccountMapping(orgId, data) {
  const existing = await db('wave_account_map')
    .where({ organization_id: orgId, expense_category_id: data.expense_category_id })
    .first();
  if (existing) {
    await db('wave_account_map').where({ id: existing.id }).update({
      wave_account_id: data.wave_account_id,
      wave_account_name: data.wave_account_name || null,
      updated_at: new Date(),
    });
    return db('wave_account_map').where({ id: existing.id }).first();
  }
  const [inserted] = await db('wave_account_map').insert({
    organization_id: orgId, ...data,
  }).returning('*');
  return inserted;
}

async function deleteAccountMapping(orgId, mappingId) {
  return db('wave_account_map').where({ id: mappingId, organization_id: orgId }).del();
}

// ─── WAVE API: TEST CONNECTION ────────────────────────────────────

async function testConnection(accessToken) {
  const data = await waveQuery(accessToken, `
    query {
      user {
        id
        defaultEmail
      }
      businesses(page: 1, pageSize: 10) {
        edges {
          node {
            id
            name
            currency { code }
          }
        }
      }
    }
  `);
  return {
    user: data.user,
    businesses: data.businesses.edges.map((e) => e.node),
  };
}

// ─── WAVE API: CUSTOMERS (Suppliers) ──────────────────────────────

async function getWaveCustomers(accessToken, businessId) {
  const data = await waveQuery(accessToken, `
    query ($businessId: ID!, $page: Int!, $pageSize: Int!) {
      business(id: $businessId) {
        customers(page: $page, pageSize: $pageSize) {
          edges {
            node {
              id
              name
              email
              address { addressLine1 city }
            }
          }
        }
      }
    }
  `, { businessId, page: 1, pageSize: 100 });
  return data.business.customers.edges.map((e) => e.node);
}

async function createWaveCustomer(accessToken, businessId, supplier) {
  const input = {
    businessId,
    name: supplier.business_name || supplier.contact_name || 'Sin nombre',
  };
  if (supplier.email) input.email = supplier.email;
  if (supplier.fiscal_address) input.address = { addressLine1: supplier.fiscal_address };

  const data = await waveQuery(accessToken, `
    mutation ($input: CustomerCreateInput!) {
      customerCreate(input: $input) {
        didSucceed
        inputErrors { message path }
        customer { id name email }
      }
    }
  `, { input });

  const result = data.customerCreate;
  if (!result.didSucceed) {
    throw new Error(`Wave customerCreate failed: ${result.inputErrors.map((e) => e.message).join('; ')}`);
  }
  return result.customer;
}

// ─── WAVE API: PRODUCTS ───────────────────────────────────────────

async function getWaveProducts(accessToken, businessId) {
  const data = await waveQuery(accessToken, `
    query ($businessId: ID!, $page: Int!, $pageSize: Int!) {
      business(id: $businessId) {
        products(page: $page, pageSize: $pageSize) {
          edges {
            node {
              id
              name
              unitPrice
              isSold
              isBought
            }
          }
        }
      }
    }
  `, { businessId, page: 1, pageSize: 100 });
  return data.business.products.edges.map((e) => e.node);
}

async function createWaveProduct(accessToken, businessId, name, unitPrice) {
  const data = await waveQuery(accessToken, `
    mutation ($input: ProductCreateInput!) {
      productCreate(input: $input) {
        didSucceed
        inputErrors { message path }
        product { id name unitPrice }
      }
    }
  `, {
    input: {
      businessId,
      name,
      unitPrice: parseFloat(unitPrice || 0).toFixed(2),
      isBought: true,
      isSold: false,
    },
  });

  const result = data.productCreate;
  if (!result.didSucceed) {
    throw new Error(`Wave productCreate failed: ${result.inputErrors.map((e) => e.message).join('; ')}`);
  }
  return result.product;
}

// ─── WAVE API: ACCOUNTS ──────────────────────────────────────────

async function getWaveAccounts(accessToken, businessId) {
  const data = await waveQuery(accessToken, `
    query ($businessId: ID!, $page: Int!, $pageSize: Int!) {
      business(id: $businessId) {
        accounts(page: $page, pageSize: $pageSize) {
          edges {
            node {
              id
              name
              type { name value }
              subtype { name value }
              isArchived
            }
          }
        }
      }
    }
  `, { businessId, page: 1, pageSize: 200 });
  return data.business.accounts.edges.map((e) => e.node);
}

// ─── WAVE API: TRANSACTIONS (for expense recording) ──────────────

async function createWaveTransaction(accessToken, businessId, accountId, amount, description, date) {
  const data = await waveQuery(accessToken, `
    mutation ($input: MoneyTransactionCreateInput!) {
      moneyTransactionCreate(input: $input) {
        didSucceed
        inputErrors { message path }
        transaction { id description }
      }
    }
  `, {
    input: {
      businessId,
      externalId: `comprar-ia-${Date.now()}`,
      date: date || new Date().toISOString().split('T')[0],
      description,
      anchor: {
        accountId,
        amount: parseFloat(amount).toFixed(2),
        direction: 'WITHDRAWAL',
      },
      lineItems: [{
        accountId,
        amount: parseFloat(amount).toFixed(2),
        balance: 'DEBIT',
      }],
    },
  });

  const result = data.moneyTransactionCreate;
  if (!result.didSucceed) {
    throw new Error(`Wave transaction failed: ${result.inputErrors.map((e) => e.message).join('; ')}`);
  }
  return result.transaction;
}

// ─── WAVE API: INVOICES ──────────────────────────────────────────

async function createWaveInvoice(accessToken, businessId, customerId, invoice, items, config) {
  // Resolve product ID for items
  const defaultProductId = config?.default_wave_product_id || undefined;

  const waveItems = items.map((item) => {
    const waveItem = {
      description: item.description || 'Servicio',
      quantity: parseFloat(item.quantity) || 1,
      unitPrice: parseFloat(item.unit_price || 0).toFixed(2),
    };
    if (defaultProductId) waveItem.productId = defaultProductId;
    return waveItem;
  });

  // If no items, create one from the invoice totals
  if (waveItems.length === 0) {
    waveItems.push({
      description: invoice.description || `Factura ${invoice.invoice_number}`,
      quantity: 1,
      unitPrice: parseFloat(invoice.taxable_amount || invoice.total_amount || 0).toFixed(2),
      ...(defaultProductId ? { productId: defaultProductId } : {}),
    });
  }

  const data = await waveQuery(accessToken, `
    mutation ($input: InvoiceCreateInput!) {
      invoiceCreate(input: $input) {
        didSucceed
        inputErrors { message path code }
        invoice {
          id
          invoiceNumber
          status
          total { value currency { code } }
          viewUrl
        }
      }
    }
  `, {
    input: {
      businessId,
      customerId,
      status: 'SAVED',
      invoiceDate: invoice.emission_date || new Date().toISOString().split('T')[0],
      memo: `Factura ${invoice.invoice_number || ''} | ${invoice.description || ''} | Comprar-IA`.trim(),
      items: waveItems,
    },
  });

  const result = data.invoiceCreate;
  if (!result.didSucceed) {
    throw new Error(`Wave invoiceCreate failed: ${result.inputErrors.map((e) => e.message).join('; ')}`);
  }
  return result.invoice;
}

// ─── WAVE API: LIST INVOICES (Pull) ──────────────────────────────

async function getWaveInvoices(accessToken, businessId, page = 1) {
  const data = await waveQuery(accessToken, `
    query ($businessId: ID!, $page: Int!, $pageSize: Int!) {
      business(id: $businessId) {
        invoices(page: $page, pageSize: $pageSize) {
          edges {
            node {
              id
              invoiceNumber
              status
              invoiceDate
              dueDate
              memo
              customer { id name }
              total { value currency { code } }
              amountDue { value }
              amountPaid { value }
              items {
                description
                quantity
                price
                subtotal { value }
                total { value }
              }
              viewUrl
            }
          }
          pageInfo { totalPages currentPage totalCount }
        }
      }
    }
  `, { businessId, page, pageSize: 50 });

  const invoicesData = data.business.invoices;
  return {
    invoices: invoicesData.edges.map((e) => e.node),
    pageInfo: invoicesData.pageInfo,
  };
}

// ─── SYNC OPERATIONS ─────────────────────────────────────────────

/**
 * Sync a single invoice to Wave
 */
async function syncInvoiceToWave(orgId, invoiceId) {
  const config = await getConfig(orgId);
  if (!config?.is_active || !config.access_token || !config.business_id) {
    throw new Error('Wave no está configurado o está desactivado');
  }

  // Check if already synced
  const existingWaveId = await getWaveId(orgId, 'invoice', invoiceId);
  if (existingWaveId) {
    return { status: 'already_synced', wave_id: existingWaveId };
  }

  // Load invoice with items
  const invoice = await db('invoices')
    .where({ 'invoices.id': invoiceId, 'invoices.organization_id': orgId })
    .leftJoin('suppliers', 'invoices.supplier_id', 'suppliers.id')
    .select('invoices.*', 'suppliers.business_name as supplier_name', 'suppliers.id as supplier_local_id')
    .first();

  if (!invoice) throw new Error('Factura no encontrada');

  const items = await db('invoice_items').where({ invoice_id: invoiceId });

  // Ensure supplier exists in Wave
  let waveCustomerId = await getWaveId(orgId, 'supplier', invoice.supplier_local_id);
  if (!waveCustomerId) {
    const supplier = await db('suppliers').where({ id: invoice.supplier_local_id }).first();
    try {
      const waveCustomer = await createWaveCustomer(config.access_token, config.business_id, supplier);
      waveCustomerId = waveCustomer.id;
      await setWaveId(orgId, 'supplier', invoice.supplier_local_id, waveCustomerId);
      await logSync(orgId, 'supplier', 'push', invoice.supplier_local_id, waveCustomerId, 'success', null, null, waveCustomer);
    } catch (err) {
      await logSync(orgId, 'supplier', 'push', invoice.supplier_local_id, null, 'error', err.message, null, null);
      throw new Error(`No se pudo crear proveedor en Wave: ${err.message}`);
    }
  }

  // Create invoice in Wave
  try {
    const waveInvoice = await createWaveInvoice(config.access_token, config.business_id, waveCustomerId, invoice, items, config);
    await setWaveId(orgId, 'invoice', invoiceId, waveInvoice.id);
    await logSync(orgId, 'invoice', 'push', invoiceId, waveInvoice.id, 'success', null, { invoice_number: invoice.invoice_number }, waveInvoice);
    logger.info(`Invoice ${invoice.invoice_number} synced to Wave: ${waveInvoice.id}`);
    return { status: 'synced', wave_id: waveInvoice.id, wave_invoice: waveInvoice };
  } catch (err) {
    await logSync(orgId, 'invoice', 'push', invoiceId, null, 'error', err.message, { invoice_number: invoice.invoice_number }, null);
    throw err;
  }
}

/**
 * Bulk sync all un-synced invoices to Wave
 */
async function syncAllInvoicesToWave(orgId) {
  const config = await getConfig(orgId);
  if (!config?.is_active) throw new Error('Wave no está configurado');

  // Find invoices not yet synced — use correct DB status values
  const syncedIds = await db('wave_entity_map')
    .where({ organization_id: orgId, entity_type: 'invoice' })
    .select('local_id');
  const syncedSet = new Set(syncedIds.map((r) => r.local_id));

  const invoices = await db('invoices')
    .where({ organization_id: orgId })
    .whereIn('status', ['registrada', 'pagada', 'pago_parcial'])
    .select('id', 'invoice_number');

  const results = { synced: 0, errors: 0, skipped: 0, details: [] };

  for (const inv of invoices) {
    if (syncedSet.has(inv.id)) {
      results.skipped++;
      continue;
    }
    try {
      const result = await syncInvoiceToWave(orgId, inv.id);
      results.synced++;
      results.details.push({ invoice: inv.invoice_number, status: result.status, wave_id: result.wave_id });
    } catch (err) {
      results.errors++;
      results.details.push({ invoice: inv.invoice_number, status: 'error', error: err.message });
      logger.warn(`Wave sync error for invoice ${inv.invoice_number}: ${err.message}`);
    }
  }

  return results;
}

/**
 * Auto-sync: called from invoiceService when status changes
 * Non-blocking — logs errors but doesn't throw
 */
async function autoSyncInvoice(orgId, invoiceId, newStatus) {
  try {
    const config = await getConfig(orgId);
    if (!config?.is_active || !config.auto_sync || !config.sync_invoices) return;

    // Only sync on these statuses
    if (!['registrada', 'pagada', 'pago_parcial'].includes(newStatus)) return;

    // Already synced?
    const existing = await getWaveId(orgId, 'invoice', invoiceId);
    if (existing) return;

    await syncInvoiceToWave(orgId, invoiceId);
    logger.info(`Auto-synced invoice ${invoiceId} to Wave on status: ${newStatus}`);
  } catch (err) {
    logger.warn(`Auto-sync to Wave failed for invoice ${invoiceId}: ${err.message}`);
    // Don't throw — auto-sync should be silent
  }
}

/**
 * Pull invoices from Wave (bidirectional sync)
 */
async function pullInvoicesFromWave(orgId) {
  const config = await getConfig(orgId);
  if (!config?.is_active) throw new Error('Wave no está configurado');

  const { invoices, pageInfo } = await getWaveInvoices(config.access_token, config.business_id);

  const results = { total: pageInfo.totalCount, fetched: invoices.length, new: 0, existing: 0, details: [] };

  for (const waveInv of invoices) {
    // Check if already mapped
    const localId = await getLocalId(orgId, 'invoice', waveInv.id);
    if (localId) {
      results.existing++;
      continue;
    }

    results.new++;
    results.details.push({
      wave_id: waveInv.id,
      number: waveInv.invoiceNumber,
      status: waveInv.status,
      customer: waveInv.customer?.name,
      total: waveInv.total?.value,
      currency: waveInv.total?.currency?.code,
      date: waveInv.invoiceDate,
      view_url: waveInv.viewUrl,
    });

    await logSync(orgId, 'invoice', 'pull', null, waveInv.id, 'success', null, null, {
      number: waveInv.invoiceNumber,
      customer: waveInv.customer?.name,
      total: waveInv.total?.value,
    });
  }

  return results;
}

/**
 * Pull customers from Wave
 */
async function pullCustomersFromWave(orgId) {
  const config = await getConfig(orgId);
  if (!config?.is_active) throw new Error('Wave no está configurado');

  const customers = await getWaveCustomers(config.access_token, config.business_id);

  const results = { total: customers.length, mapped: 0, unmapped: 0, details: [] };

  for (const cust of customers) {
    const localId = await getLocalId(orgId, 'supplier', cust.id);
    if (localId) {
      results.mapped++;
    } else {
      results.unmapped++;
    }
    results.details.push({
      wave_id: cust.id,
      name: cust.name,
      email: cust.email,
      mapped_to_local: localId || null,
    });
  }

  return results;
}

/**
 * Get sync status summary
 */
async function getSyncStatus(orgId) {
  const config = await getConfig(orgId);
  if (!config) return { configured: false };

  // Use correct DB status values
  const totalInvoices = await db('invoices')
    .where({ organization_id: orgId })
    .whereIn('status', ['registrada', 'pagada', 'pago_parcial'])
    .count('id as count')
    .first();

  const syncedInvoices = await db('wave_entity_map')
    .where({ organization_id: orgId, entity_type: 'invoice' })
    .count('id as count')
    .first();

  const syncedSuppliers = await db('wave_entity_map')
    .where({ organization_id: orgId, entity_type: 'supplier' })
    .count('id as count')
    .first();

  const totalSuppliers = await db('suppliers')
    .where({ organization_id: orgId, is_active: true })
    .count('id as count')
    .first();

  const lastSync = await db('wave_sync_logs')
    .where({ organization_id: orgId, status: 'success' })
    .orderBy('created_at', 'desc')
    .first();

  const recentErrors = await db('wave_sync_logs')
    .where({ organization_id: orgId, status: 'error' })
    .orderBy('created_at', 'desc')
    .limit(5);

  const productMappings = await db('wave_product_map')
    .where({ organization_id: orgId })
    .count('id as count')
    .first();

  const accountMappings = await db('wave_account_map')
    .where({ organization_id: orgId })
    .count('id as count')
    .first();

  return {
    configured: true,
    is_active: config.is_active,
    auto_sync: config.auto_sync,
    business_name: config.business_name,
    sync_invoices: config.sync_invoices,
    sync_suppliers: config.sync_suppliers,
    default_product: config.default_wave_product_name || null,
    invoices: {
      total: parseInt(totalInvoices.count),
      synced: parseInt(syncedInvoices.count),
      pending: parseInt(totalInvoices.count) - parseInt(syncedInvoices.count),
    },
    suppliers: {
      total: parseInt(totalSuppliers.count),
      synced: parseInt(syncedSuppliers.count),
    },
    mappings: {
      products: parseInt(productMappings.count),
      accounts: parseInt(accountMappings.count),
    },
    last_sync: lastSync?.created_at || null,
    recent_errors: recentErrors,
  };
}

module.exports = {
  getConfig,
  saveConfig,
  deleteConfig,
  testConnection,
  getWaveCustomers,
  getWaveProducts,
  createWaveProduct,
  getWaveAccounts,
  createWaveTransaction,
  syncInvoiceToWave,
  syncAllInvoicesToWave,
  autoSyncInvoice,
  pullInvoicesFromWave,
  pullCustomersFromWave,
  getSyncStatus,
  getSyncLogs,
  getProductMappings,
  saveProductMapping,
  deleteProductMapping,
  getAccountMappings,
  saveAccountMapping,
  deleteAccountMapping,
  getAllMappings,
};
