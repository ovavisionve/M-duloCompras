const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const waveService = require('../services/waveService');
const auditService = require('../services/auditService');

// ─── GET CONFIG ───────────────────────────────────────────────────
router.get('/config', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const config = await waveService.getConfig(req.user.organizationId);
    if (!config) return res.json({ success: true, data: null });
    const masked = { ...config, access_token: config.access_token ? '••••••' + config.access_token.slice(-6) : null };
    res.json({ success: true, data: masked });
  } catch (err) { next(err); }
});

// ─── SAVE CONFIG ──────────────────────────────────────────────────
router.post('/config', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const {
      access_token, business_id, business_name, is_active,
      sync_invoices, sync_suppliers, auto_sync,
      default_wave_product_id, default_wave_product_name,
    } = req.body;
    if (!access_token && !business_id) {
      return res.status(400).json({ success: false, error: { message: 'Token o Business ID requerido' } });
    }
    const config = await waveService.saveConfig(req.user.organizationId, {
      access_token, business_id, business_name, is_active,
      sync_invoices, sync_suppliers, auto_sync,
      default_wave_product_id, default_wave_product_name,
    });
    await auditService.logAction(req.user.id, 'wave_config', config.id, 'update', null, { business_id, is_active, auto_sync }, req.ip);
    const masked = { ...config, access_token: config.access_token ? '••••••' + config.access_token.slice(-6) : null };
    res.json({ success: true, data: masked });
  } catch (err) { next(err); }
});

// ─── DELETE CONFIG ────────────────────────────────────────────────
router.delete('/config', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    await waveService.deleteConfig(req.user.organizationId);
    await auditService.logAction(req.user.id, 'wave_config', null, 'delete', null, null, req.ip);
    res.json({ success: true, message: 'Configuración de Wave eliminada' });
  } catch (err) { next(err); }
});

// ─── TEST CONNECTION ──────────────────────────────────────────────
router.post('/test-connection', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { access_token } = req.body;
    if (!access_token) {
      return res.status(400).json({ success: false, error: { message: 'Token requerido' } });
    }
    const result = await waveService.testConnection(access_token);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, error: { message: err.message || 'No se pudo conectar con Wave' } });
  }
});

// ─── SYNC STATUS ──────────────────────────────────────────────────
router.get('/status', authenticate, async (req, res, next) => {
  try {
    const status = await waveService.getSyncStatus(req.user.organizationId);
    res.json({ success: true, data: status });
  } catch (err) { next(err); }
});

// ─── SYNC LOGS ────────────────────────────────────────────────────
router.get('/logs', authenticate, async (req, res, next) => {
  try {
    const logs = await waveService.getSyncLogs(req.user.organizationId, req.query);
    res.json({ success: true, data: logs });
  } catch (err) { next(err); }
});

// ─── PUSH: SYNC SINGLE INVOICE ───────────────────────────────────
router.post('/sync/invoice/:id', authenticate, authorize('admin', 'contador'), async (req, res, next) => {
  try {
    const result = await waveService.syncInvoiceToWave(req.user.organizationId, req.params.id);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, error: { message: err.message } });
  }
});

// ─── PUSH: SYNC ALL INVOICES ─────────────────────────────────────
router.post('/sync/invoices', authenticate, authorize('admin', 'contador'), async (req, res, next) => {
  try {
    const result = await waveService.syncAllInvoicesToWave(req.user.organizationId);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, error: { message: err.message } });
  }
});

// ─── PULL: INVOICES FROM WAVE ─────────────────────────────────────
router.post('/pull/invoices', authenticate, authorize('admin', 'contador'), async (req, res, next) => {
  try {
    const result = await waveService.pullInvoicesFromWave(req.user.organizationId);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, error: { message: err.message } });
  }
});

// ─── PULL: CUSTOMERS FROM WAVE ────────────────────────────────────
router.post('/pull/customers', authenticate, authorize('admin', 'contador'), async (req, res, next) => {
  try {
    const result = await waveService.pullCustomersFromWave(req.user.organizationId);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, error: { message: err.message } });
  }
});

// ─── WAVE CUSTOMERS ───────────────────────────────────────────────
router.get('/customers', authenticate, async (req, res, next) => {
  try {
    const config = await waveService.getConfig(req.user.organizationId);
    if (!config?.is_active) return res.status(400).json({ success: false, error: { message: 'Wave no está configurado' } });
    const customers = await waveService.getWaveCustomers(config.access_token, config.business_id);
    res.json({ success: true, data: customers });
  } catch (err) { next(err); }
});

// ─── WAVE PRODUCTS ────────────────────────────────────────────────
router.get('/products', authenticate, async (req, res, next) => {
  try {
    const config = await waveService.getConfig(req.user.organizationId);
    if (!config?.is_active) return res.status(400).json({ success: false, error: { message: 'Wave no está configurado' } });
    const products = await waveService.getWaveProducts(config.access_token, config.business_id);
    res.json({ success: true, data: products });
  } catch (err) { next(err); }
});

// ─── WAVE ACCOUNTS ────────────────────────────────────────────────
router.get('/accounts', authenticate, async (req, res, next) => {
  try {
    const config = await waveService.getConfig(req.user.organizationId);
    if (!config?.is_active) return res.status(400).json({ success: false, error: { message: 'Wave no está configurado' } });
    const accounts = await waveService.getWaveAccounts(config.access_token, config.business_id);
    res.json({ success: true, data: accounts });
  } catch (err) { next(err); }
});

// ─── PRODUCT MAPPINGS ─────────────────────────────────────────────
router.get('/mappings/products', authenticate, async (req, res, next) => {
  try {
    const mappings = await waveService.getProductMappings(req.user.organizationId);
    res.json({ success: true, data: mappings });
  } catch (err) { next(err); }
});

router.post('/mappings/products', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const mapping = await waveService.saveProductMapping(req.user.organizationId, req.body);
    res.json({ success: true, data: mapping });
  } catch (err) { next(err); }
});

router.delete('/mappings/products/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    await waveService.deleteProductMapping(req.user.organizationId, req.params.id);
    res.json({ success: true, message: 'Mapeo eliminado' });
  } catch (err) { next(err); }
});

// ─── ACCOUNT MAPPINGS ─────────────────────────────────────────────
router.get('/mappings/accounts', authenticate, async (req, res, next) => {
  try {
    const mappings = await waveService.getAccountMappings(req.user.organizationId);
    res.json({ success: true, data: mappings });
  } catch (err) { next(err); }
});

router.post('/mappings/accounts', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const mapping = await waveService.saveAccountMapping(req.user.organizationId, req.body);
    res.json({ success: true, data: mapping });
  } catch (err) { next(err); }
});

router.delete('/mappings/accounts/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    await waveService.deleteAccountMapping(req.user.organizationId, req.params.id);
    res.json({ success: true, message: 'Mapeo eliminado' });
  } catch (err) { next(err); }
});

module.exports = router;
