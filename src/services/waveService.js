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
  if (existing) {
    await db('wave_config').where({ id: existing.id }).update({
      access_token: data.access_token ?? existing.access_token,
      business_id: data.business_id ?? existing.business_id,
      business_name: data.business_name ?? existing.business_name,
      is_active: data.is_active ?? existing.is_active,
      sync_invoices: data.sync_invoices ?? existing.sync_invoices,
      sync_suppliers: data.sync_suppliers ?? existing.sync_suppliers,
      updated_at: new Date(),
    });
    return getConfig(orgId);
  }
  const [inserted] = await db('wave_config')
    .insert({ organization_id: orgId, ...data })
    .returning('*');
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
  const data = await waveQuery(accessToken, `
    mutation ($input: CustomerCreateInput!) {
      customerCreate(input: $input) {
        didSucceed
        inputErrors { message path }
        customer {
          id
          name
          email
        }
      }
    }
  `, {
    input: {
      businessId,
      name: supplier.business_name || supplier.contact_name,
      email: supplier.email || undefined,
      address: supplier.address ? { addressLine1: supplier.address } : undefined,
    },
  });

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

// ─── WAVE API: INVOICES ──────────────────────────────────────────

async function createWaveInvoice(accessToken, businessId, customerId, invoice, items) {
  const waveItems = items.map((item) => ({
    productId: item.wave_product_id || undefined,
    description: item.description || item.concept || 'Servicio',
    quantity: parseFloat(item.quantity) || 1,
    unitPrice: parseFloat(item.unit_price || item.base_amount || 0).toFixed(2),
  }));

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
      invoiceDate: invoice.invoice_date || new Date().toISOString().split('T')[0],
      dueDate: invoice.due_date || undefined,
      memo: `Factura ${invoice.invoice_number || ''} - Comprar-IA`,
      items: waveItems,
    },
  });

  const result = data.invoiceCreate;
  if (!result.didSucceed) {
    throw new Error(`Wave invoiceCreate failed: ${result.inputErrors.map((e) => e.message).join('; ')}`);
  }
  return result.invoice;
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
    const waveInvoice = await createWaveInvoice(config.access_token, config.business_id, waveCustomerId, invoice, items);
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

  // Find invoices not yet synced
  const syncedIds = await db('wave_entity_map')
    .where({ organization_id: orgId, entity_type: 'invoice' })
    .select('local_id');
  const syncedSet = new Set(syncedIds.map((r) => r.local_id));

  const invoices = await db('invoices')
    .where({ organization_id: orgId })
    .whereIn('status', ['approved', 'paid', 'partial'])
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
 * Get sync status summary
 */
async function getSyncStatus(orgId) {
  const config = await getConfig(orgId);
  if (!config) return { configured: false };

  const totalInvoices = await db('invoices')
    .where({ organization_id: orgId })
    .whereIn('status', ['approved', 'paid', 'partial'])
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

  const lastSync = await db('wave_sync_logs')
    .where({ organization_id: orgId, status: 'success' })
    .orderBy('created_at', 'desc')
    .first();

  const recentErrors = await db('wave_sync_logs')
    .where({ organization_id: orgId, status: 'error' })
    .orderBy('created_at', 'desc')
    .limit(5);

  return {
    configured: true,
    is_active: config.is_active,
    business_name: config.business_name,
    sync_invoices: config.sync_invoices,
    sync_suppliers: config.sync_suppliers,
    invoices: {
      total: parseInt(totalInvoices.count),
      synced: parseInt(syncedInvoices.count),
      pending: parseInt(totalInvoices.count) - parseInt(syncedInvoices.count),
    },
    suppliers_synced: parseInt(syncedSuppliers.count),
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
  getWaveAccounts,
  syncInvoiceToWave,
  syncAllInvoicesToWave,
  getSyncStatus,
  getSyncLogs,
};
