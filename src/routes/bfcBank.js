const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const bfcService = require('../services/bfcBankService');
const auditService = require('../services/auditService');

// ─── GET CONFIG ──────────────────────────────────────────────────
router.get('/config', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const config = await bfcService.getConfig(req.user.organizationId);
    if (!config) return res.json({ success: true, data: null });
    const safe = {
      ...config,
      password_encrypted: undefined,
      has_password: !!config.password_encrypted,
    };
    delete safe.password_encrypted;
    res.json({ success: true, data: safe });
  } catch (err) { next(err); }
});

// ─── SAVE CONFIG ─────────────────────────────────────────────────
router.post('/config', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { base_url, username, password, cedula, is_active, auto_import, proxy_api_key } = req.body;
    if (!base_url || !username || !cedula) {
      return res.status(400).json({ success: false, error: { message: 'URL, usuario y cédula son requeridos' } });
    }
    const config = await bfcService.saveConfig(req.user.organizationId, {
      base_url, username, password, cedula, is_active, auto_import, proxy_api_key,
    });
    await auditService.logAction(req.user.id, 'bfc_config', config.id, 'update', null, { base_url, cedula, is_active }, req.ip);
    const safe = { ...config, password_encrypted: undefined, has_password: true };
    delete safe.password_encrypted;
    res.json({ success: true, data: safe });
  } catch (err) { next(err); }
});

// ─── DELETE CONFIG ───────────────────────────────────────────────
router.delete('/config', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    await bfcService.deleteConfig(req.user.organizationId);
    await auditService.logAction(req.user.id, 'bfc_config', null, 'delete', null, null, req.ip);
    res.json({ success: true, message: 'Configuración BFC eliminada' });
  } catch (err) { next(err); }
});

// ─── TEST CONNECTION ─────────────────────────────────────────────
router.post('/test-connection', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const result = await bfcService.testConnection(req.user.organizationId);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, error: { message: err.message || 'No se pudo conectar con BFC' } });
  }
});

// ─── ACCOUNTS ────────────────────────────────────────────────────
router.get('/accounts', authenticate, async (req, res, next) => {
  try {
    const accounts = await bfcService.getAccounts(req.user.organizationId);
    res.json({ success: true, data: accounts });
  } catch (err) { next(err); }
});

router.post('/accounts', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const { account_number, account_alias, bank_account_id } = req.body;
    if (!account_number) {
      return res.status(400).json({ success: false, error: { message: 'Número de cuenta requerido' } });
    }
    const account = await bfcService.saveAccount(req.user.organizationId, {
      account_number, account_alias, bank_account_id,
    });
    res.json({ success: true, data: account });
  } catch (err) { next(err); }
});

router.delete('/accounts/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    await bfcService.deleteAccount(req.user.organizationId, req.params.id);
    res.json({ success: true, message: 'Cuenta BFC eliminada' });
  } catch (err) { next(err); }
});

// ─── BALANCE ─────────────────────────────────────────────────────
router.get('/balance/:accountNumber', authenticate, authorize('admin', 'tesorero', 'contador'), async (req, res, next) => {
  try {
    const data = await bfcService.getBalance(req.user.organizationId, req.params.accountNumber);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: { message: err.message } });
  }
});

// ─── MOVEMENTS ───────────────────────────────────────────────────
router.post('/movements/:accountNumber', authenticate, authorize('admin', 'tesorero', 'contador'), async (req, res, next) => {
  try {
    const { from_date, to_date, bandera, limit, page } = req.body;
    const data = await bfcService.getMovements(req.user.organizationId, req.params.accountNumber, {
      from_date, to_date, bandera, limit, page,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: { message: err.message } });
  }
});

// ─── IMPORT MOVEMENTS ───────────────────────────────────────────
router.post('/import/:accountNumber', authenticate, authorize('admin', 'tesorero', 'contador'), async (req, res, next) => {
  try {
    const { from_date, to_date, bandera } = req.body;
    const result = await bfcService.importMovements(req.user.organizationId, req.params.accountNumber, {
      from_date, to_date, bandera,
    });
    await auditService.logAction(req.user.id, 'bfc_import', null, 'import', null, result, req.ip);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, error: { message: err.message } });
  }
});

// ─── AUTO IMPORT ALL ─────────────────────────────────────────────
router.post('/import-all', authenticate, authorize('admin', 'tesorero'), async (req, res, next) => {
  try {
    const results = await bfcService.autoImportAll(req.user.organizationId);
    res.json({ success: true, data: results });
  } catch (err) {
    res.status(400).json({ success: false, error: { message: err.message } });
  }
});

// ─── SYNC LOGS ───────────────────────────────────────────────────
router.get('/logs', authenticate, async (req, res, next) => {
  try {
    const logs = await bfcService.getSyncLogs(req.user.organizationId, req.query);
    res.json({ success: true, data: logs });
  } catch (err) { next(err); }
});

module.exports = router;
