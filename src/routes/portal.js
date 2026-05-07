const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const db = require('../database/connection');
const { authenticate, requireSuperAdmin, getJwtSecret } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { validate } = require('../middleware/validate');
const auditService = require('../services/auditService');
const { generateSecret, verifyTotp, getTotpUri } = require('../utils/totp');

// All portal endpoints require an authenticated super_admin.
router.use(authenticate, requireSuperAdmin);

const DEFAULT_EXPENSE_CATEGORIES = [
  { name: 'Servicios Tecnológicos', code: 'SER-TEC', description: 'Software, hosting, desarrollo' },
  { name: 'Alquiler', code: 'ALQ', description: 'Alquiler de oficina' },
  { name: 'Papelería', code: 'PAP', description: 'Papelería y suministros de oficina' },
  { name: 'Servicios Profesionales', code: 'SER-PRO', description: 'Consultorías, asesorías legales/contables' },
  { name: 'Publicidad y Marketing', code: 'PUB-MKT', description: 'Publicidad y propaganda' },
  { name: 'Hosting y Dominios', code: 'HOS-DOM', description: 'Hosting web y dominios' },
  { name: 'Servicios Básicos', code: 'SER-BAS', description: 'Electricidad, agua, etc.' },
  { name: 'Transporte y Fletes', code: 'TRA-FLE', description: 'Fletes y transporte' },
  { name: 'Otros Gastos', code: 'OTR', description: 'Gastos no clasificados' },
];

const DEFAULT_COST_CENTERS = [
  { name: 'Operaciones', code: 'OPE', description: 'Operaciones generales' },
  { name: 'Administración', code: 'ADM', description: 'Administración general' },
  { name: 'Ventas', code: 'VEN', description: 'Ventas y comercialización' },
  { name: 'Tecnología', code: 'TEC', description: 'Departamento de tecnología' },
];

function defaultConfigEntries(name, rif, address) {
  return [
    { key: 'company_name', value: name, description: 'Razón social' },
    { key: 'company_rif', value: rif || '', description: 'RIF de la empresa' },
    { key: 'company_address', value: address || '', description: 'Dirección fiscal' },
    { key: 'tax_unit_value', value: '9.00', description: 'Valor Unidad Tributaria (Bs.)' },
    { key: 'is_special_taxpayer', value: 'false', description: 'Es contribuyente especial' },
    { key: 'is_retention_agent_iva', value: 'false', description: 'Es agente de retención de IVA' },
    { key: 'default_vat_rate', value: '16', description: 'Alícuota IVA por defecto (%)' },
    { key: 'ticket_vat_rate', value: '8', description: 'Alícuota IVA boleto (%)' },
    { key: 'igtf_rate', value: '3', description: 'Tasa IGTF (%)' },
    { key: 'withholding_counter_islr', value: '0', description: 'Contador correlativo retenciones ISLR' },
    { key: 'withholding_counter_iva', value: '0', description: 'Contador correlativo retenciones IVA' },
  ];
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

async function uniqueSlug(base) {
  let slug = base || `org-${Date.now()}`;
  let i = 1;
  while (await db('organizations').where({ slug }).first()) {
    slug = `${base}-${i++}`;
  }
  return slug;
}

// ─── LIST ORGANIZATIONS ──────────────────────────────────────────
router.get('/organizations', async (req, res, next) => {
  try {
    const orgs = await db('organizations')
      .select('id', 'name', 'slug', 'rif', 'is_active', 'created_at', 'updated_at')
      .orderBy('created_at', 'desc');

    const ids = orgs.map((o) => o.id);
    const userCounts = ids.length
      ? await db('users').whereIn('organization_id', ids).select('organization_id').count('* as count').groupBy('organization_id')
      : [];
    const invoiceCounts = ids.length
      ? await db('invoices').whereIn('organization_id', ids).select('organization_id').count('* as count').groupBy('organization_id')
      : [];

    const usersByOrg = Object.fromEntries(userCounts.map((r) => [r.organization_id, parseInt(r.count, 10)]));
    const invoicesByOrg = Object.fromEntries(invoiceCounts.map((r) => [r.organization_id, parseInt(r.count, 10)]));

    const data = orgs.map((o) => ({
      ...o,
      user_count: usersByOrg[o.id] || 0,
      invoice_count: invoicesByOrg[o.id] || 0,
    }));

    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ─── CREATE ORGANIZATION (provisioning wizard) ───────────────────
router.post('/organizations', [
  body('name').isString().trim().isLength({ min: 2, max: 200 }).withMessage('Nombre requerido (2-200 caracteres)'),
  body('admin_email').isEmail().withMessage('Email de admin inválido').normalizeEmail(),
  body('admin_password').isString().isLength({ min: 8 }).withMessage('Contraseña mínimo 8 caracteres'),
  body('admin_full_name').isString().trim().isLength({ min: 2, max: 150 }).withMessage('Nombre completo requerido'),
  body('rif').optional({ nullable: true }).isString().trim().isLength({ max: 15 }),
  body('slug').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
  body('address').optional({ nullable: true }).isString().trim(),
], validate, async (req, res, next) => {
  try {
    const { name, rif, address, admin_email, admin_password, admin_full_name } = req.body;
    let { slug } = req.body;

    const emailExists = await db('users').where({ email: admin_email }).first();
    if (emailExists) {
      throw new AppError('Ya existe un usuario con ese email', 409, 'USER_EMAIL_TAKEN');
    }

    slug = slug ? slugify(slug) : slugify(name);
    slug = await uniqueSlug(slug);

    const result = await db.transaction(async (trx) => {
      const [org] = await trx('organizations').insert({
        name, slug, rif: rif || null, is_active: true,
      }).returning('*');

      const passwordHash = await bcrypt.hash(admin_password, 12);
      const [adminUser] = await trx('users').insert({
        email: admin_email,
        password_hash: passwordHash,
        full_name: admin_full_name,
        role: 'admin',
        organization_id: org.id,
        is_active: true,
      }).returning(['id', 'email', 'full_name', 'role', 'is_active']);

      await trx('config').insert(
        defaultConfigEntries(name, rif, address).map((c) => ({ ...c, organization_id: org.id }))
      );

      await trx('expense_categories').insert(
        DEFAULT_EXPENSE_CATEGORIES.map((c) => ({ ...c, is_active: true, organization_id: org.id }))
      );

      await trx('cost_centers').insert(
        DEFAULT_COST_CENTERS.map((c) => ({ ...c, is_active: true, organization_id: org.id }))
      );

      return { organization: org, admin_user: adminUser };
    });

    await auditService.logAction(req.user.id, 'organization', result.organization.id, 'create', null, { name, slug }, req.ip, result.organization.id);

    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

// ─── GET ORGANIZATION DETAIL ─────────────────────────────────────
router.get('/organizations/:id', async (req, res, next) => {
  try {
    const org = await db('organizations').where({ id: req.params.id }).first();
    if (!org) throw new AppError('Organización no encontrada', 404, 'ORG_NOT_FOUND');

    const [{ count: userCount }] = await db('users').where({ organization_id: org.id }).count('* as count');
    const [{ count: invoiceCount }] = await db('invoices').where({ organization_id: org.id }).count('* as count');
    const [{ count: supplierCount }] = await db('suppliers').where({ organization_id: org.id }).count('* as count');

    res.json({
      success: true,
      data: {
        ...org,
        user_count: parseInt(userCount, 10),
        invoice_count: parseInt(invoiceCount, 10),
        supplier_count: parseInt(supplierCount, 10),
      },
    });
  } catch (err) { next(err); }
});

// ─── UPDATE ORGANIZATION ─────────────────────────────────────────
router.patch('/organizations/:id', [
  body('name').optional().isString().trim().isLength({ min: 2, max: 200 }),
  body('rif').optional({ nullable: true }).isString().trim().isLength({ max: 15 }),
  body('is_active').optional().isBoolean(),
], validate, async (req, res, next) => {
  try {
    const updates = {};
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.rif !== undefined) updates.rif = req.body.rif || null;
    if (req.body.is_active !== undefined) updates.is_active = req.body.is_active;
    if (Object.keys(updates).length === 0) {
      throw new AppError('Sin cambios', 400, 'NO_CHANGES');
    }
    updates.updated_at = new Date();

    const [org] = await db('organizations').where({ id: req.params.id }).update(updates).returning('*');
    if (!org) throw new AppError('Organización no encontrada', 404, 'ORG_NOT_FOUND');

    await auditService.logAction(req.user.id, 'organization', org.id, 'update', null, updates, req.ip, org.id);
    res.json({ success: true, data: org });
  } catch (err) { next(err); }
});

// ─── LIST USERS OF AN ORGANIZATION ───────────────────────────────
router.get('/organizations/:id/users', async (req, res, next) => {
  try {
    const org = await db('organizations').where({ id: req.params.id }).first();
    if (!org) throw new AppError('Organización no encontrada', 404, 'ORG_NOT_FOUND');

    const users = await db('users')
      .where({ organization_id: org.id })
      .select('id', 'email', 'full_name', 'role', 'is_active', 'last_login', 'created_at')
      .orderBy('created_at', 'desc');

    res.json({ success: true, data: users });
  } catch (err) { next(err); }
});

// ─── CREATE USER IN ORGANIZATION ─────────────────────────────────
router.post('/organizations/:id/users', [
  body('email').isEmail().normalizeEmail(),
  body('password').isString().isLength({ min: 8 }),
  body('full_name').isString().trim().isLength({ min: 2, max: 150 }),
  body('role').isIn(['admin', 'contador', 'tesorero', 'operador', 'auditor', 'api_consumer']),
], validate, async (req, res, next) => {
  try {
    const org = await db('organizations').where({ id: req.params.id }).first();
    if (!org) throw new AppError('Organización no encontrada', 404, 'ORG_NOT_FOUND');

    const { email, password, full_name, role } = req.body;
    const exists = await db('users').where({ email }).first();
    if (exists) throw new AppError('El email ya está registrado', 409, 'USER_EMAIL_TAKEN');

    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db('users').insert({
      email, password_hash: passwordHash, full_name, role,
      organization_id: org.id, is_active: true,
    }).returning(['id', 'email', 'full_name', 'role', 'is_active', 'created_at']);

    await auditService.logAction(req.user.id, 'user', user.id, 'create', null, { email, role, organization_id: org.id }, req.ip, org.id);
    res.status(201).json({ success: true, data: user });
  } catch (err) { next(err); }
});

// ─── UPDATE USER (password reset, role change, deactivate) ──────
router.patch('/organizations/:orgId/users/:userId', [
  body('password').optional().isString().isLength({ min: 8 }),
  body('role').optional().isIn(['admin', 'contador', 'tesorero', 'operador', 'auditor', 'api_consumer']),
  body('is_active').optional().isBoolean(),
  body('full_name').optional().isString().trim().isLength({ min: 2, max: 150 }),
], validate, async (req, res, next) => {
  try {
    const user = await db('users')
      .where({ id: req.params.userId, organization_id: req.params.orgId })
      .first();
    if (!user) throw new AppError('Usuario no encontrado en la organización', 404, 'USER_NOT_FOUND');

    const updates = {};
    if (req.body.full_name !== undefined) updates.full_name = req.body.full_name;
    if (req.body.role !== undefined) updates.role = req.body.role;
    if (req.body.is_active !== undefined) updates.is_active = req.body.is_active;
    if (req.body.password) updates.password_hash = await bcrypt.hash(req.body.password, 12);
    if (Object.keys(updates).length === 0) {
      throw new AppError('Sin cambios', 400, 'NO_CHANGES');
    }
    updates.updated_at = new Date();

    const [updated] = await db('users').where({ id: user.id }).update(updates)
      .returning(['id', 'email', 'full_name', 'role', 'is_active']);

    const auditChanges = { ...updates };
    delete auditChanges.password_hash;
    if (req.body.password) auditChanges.password_changed = true;
    await auditService.logAction(req.user.id, 'user', user.id, 'update', null, auditChanges, req.ip, user.organization_id);

    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// ─── IMPERSONATE ORG ADMIN ───────────────────────────────────────
router.post('/organizations/:id/impersonate', async (req, res, next) => {
  try {
    const org = await db('organizations').where({ id: req.params.id, is_active: true }).first();
    if (!org) throw new AppError('Organización no encontrada o inactiva', 404, 'ORG_NOT_FOUND');

    // Prefer admin role; fall back to any active user
    const user = await db('users')
      .where({ organization_id: org.id, is_active: true })
      .orderByRaw(`CASE WHEN role = 'admin' THEN 0 ELSE 1 END`)
      .first();
    if (!user) throw new AppError('No hay usuarios activos en esta organización', 404, 'NO_ACTIVE_USERS');

    const token = jwt.sign(
      { userId: user.id, role: user.role, impersonated: true, impersonatedBy: req.user.id },
      getJwtSecret(),
      { expiresIn: '2h' }
    );

    await auditService.logAction(
      req.user.id, 'user', user.id, 'impersonate',
      null, { org_id: org.id, org_name: org.name },
      req.ip, org.id
    );

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id, email: user.email, fullName: user.full_name,
          role: user.role, organizationId: org.id, orgName: org.name,
        },
        org: { id: org.id, name: org.name, slug: org.slug },
        expires_in: 7200,
      },
    });
  } catch (err) { next(err); }
});

// ─── TOTP STATUS ─────────────────────────────────────────────────
router.get('/auth/totp/status', async (req, res, next) => {
  try {
    const user = await db('users').where({ id: req.user.id }).select('totp_enabled').first();
    res.json({ success: true, data: { totp_enabled: Boolean(user?.totp_enabled) } });
  } catch (err) { next(err); }
});

// ─── TOTP SETUP — generate pending secret ────────────────────────
router.get('/auth/totp/setup', async (req, res, next) => {
  try {
    const secret = generateSecret();
    const uri = getTotpUri(secret, req.user.email);
    res.json({ success: true, data: { secret, uri } });
  } catch (err) { next(err); }
});

// ─── TOTP ACTIVATE ────────────────────────────────────────────────
router.post('/auth/totp/activate', [
  body('secret').isString().isLength({ min: 16, max: 64 }).withMessage('Secret inválido'),
  body('code').isString().isLength({ min: 6, max: 6 }).matches(/^\d{6}$/).withMessage('Código debe ser 6 dígitos'),
], validate, async (req, res, next) => {
  try {
    const { secret, code } = req.body;
    if (!verifyTotp(secret, code)) {
      throw new AppError('Código inválido. Asegúrese que el reloj esté sincronizado.', 400, 'TOTP_INVALID');
    }
    await db('users').where({ id: req.user.id }).update({ totp_secret: secret, totp_enabled: true });
    await auditService.logAction(req.user.id, 'user', req.user.id, 'totp_enable', null, null, req.ip, null);
    res.json({ success: true, data: { totp_enabled: true } });
  } catch (err) { next(err); }
});

// ─── TOTP DISABLE ─────────────────────────────────────────────────
router.delete('/auth/totp', [
  body('code').isString().isLength({ min: 6, max: 6 }).matches(/^\d{6}$/).withMessage('Código debe ser 6 dígitos'),
], validate, async (req, res, next) => {
  try {
    const user = await db('users').where({ id: req.user.id }).first();
    if (!user.totp_enabled) throw new AppError('2FA no está habilitado', 400, 'TOTP_NOT_ENABLED');
    if (!verifyTotp(user.totp_secret, req.body.code)) {
      throw new AppError('Código inválido', 400, 'TOTP_INVALID');
    }
    await db('users').where({ id: req.user.id }).update({ totp_secret: null, totp_enabled: false });
    await auditService.logAction(req.user.id, 'user', req.user.id, 'totp_disable', null, null, req.ip, null);
    res.json({ success: true, data: { totp_enabled: false } });
  } catch (err) { next(err); }
});

// ─── GLOBAL STATS ────────────────────────────────────────────────
router.get('/stats', async (req, res, next) => {
  try {
    const [{ count: orgCount }] = await db('organizations').count('* as count');
    const [{ count: activeOrgCount }] = await db('organizations').where({ is_active: true }).count('* as count');
    const [{ count: userCount }] = await db('users').count('* as count');
    const [{ count: invoiceCount }] = await db('invoices').count('* as count');
    const [{ count: supplierCount }] = await db('suppliers').count('* as count');

    res.json({
      success: true,
      data: {
        organizations_total: parseInt(orgCount, 10),
        organizations_active: parseInt(activeOrgCount, 10),
        users_total: parseInt(userCount, 10),
        invoices_total: parseInt(invoiceCount, 10),
        suppliers_total: parseInt(supplierCount, 10),
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
