const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/connection');
const { authenticate, authorize, getJwtSecret } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { authRateLimiter } = require('../middleware/rateLimiter');
const { body } = require('express-validator');
const { validate } = require('../middleware/validate');
const auditService = require('../services/auditService');

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Iniciar sesión
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login exitoso, retorna token JWT y datos del usuario
 *       400:
 *         description: Email y contraseña requeridos
 *       401:
 *         description: Credenciales inválidas
 */
router.post('/login', authRateLimiter, [
  body('email').isEmail().withMessage('Email inválido').normalizeEmail(),
  body('password').notEmpty().withMessage('Contraseña requerida'),
], validate, async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await db('users')
      .leftJoin('organizations', 'users.organization_id', 'organizations.id')
      .where({ 'users.email': email, 'users.is_active': true })
      .select('users.*', 'organizations.name as org_name', 'organizations.slug as org_slug')
      .first();
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new AppError('Credenciales inválidas', 401, 'INVALID_CREDENTIALS');
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      getJwtSecret(),
      { expiresIn: process.env.JWT_EXPIRATION || '8h' }
    );

    const refreshToken = jwt.sign(
      { userId: user.id, type: 'refresh' },
      getJwtSecret(),
      { expiresIn: process.env.JWT_REFRESH_EXPIRATION || '7d' }
    );

    await db('users').where({ id: user.id }).update({ last_login: new Date() });
    await auditService.logAction(user.id, 'user', user.id, 'login', null, null, req.ip);

    res.json({
      success: true,
      data: {
        token,
        refreshToken,
        user: {
          id: user.id, email: user.email, fullName: user.full_name, role: user.role,
          organizationId: user.organization_id, orgName: user.org_name,
        },
      },
    });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Renovar token de acceso
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: Token de refresco obtenido en el login
 *     responses:
 *       200:
 *         description: Nuevo token JWT generado
 *       400:
 *         description: Refresh token requerido
 *       401:
 *         description: Token inválido o usuario no encontrado
 */
router.post('/refresh', authRateLimiter, async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) throw new AppError('Refresh token requerido', 400);

    const decoded = jwt.verify(refreshToken, getJwtSecret());
    if (decoded.type !== 'refresh') throw new AppError('Token inválido', 401);

    const user = await db('users').where({ id: decoded.userId, is_active: true }).first();
    if (!user) throw new AppError('Usuario no encontrado', 401);

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      getJwtSecret(),
      { expiresIn: process.env.JWT_EXPIRATION || '8h' }
    );

    res.json({ success: true, data: { token } });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Obtener perfil del usuario autenticado
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Datos del usuario autenticado
 *       401:
 *         description: No autenticado
 */
router.get('/me', authenticate, (req, res) => {
  res.json({ success: true, data: req.user });
});

/**
 * @swagger
 * /auth/users:
 *   post:
 *     summary: Crear nuevo usuario (solo admin)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, full_name, role]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *               full_name:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [admin, accountant, viewer]
 *     responses:
 *       201:
 *         description: Usuario creado exitosamente
 *       400:
 *         description: Campos requeridos faltantes
 *       401:
 *         description: No autenticado
 *       403:
 *         description: No autorizado (requiere rol admin)
 *       409:
 *         description: El email ya está registrado
 */
router.post('/users', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { email, password, full_name, role } = req.body;
    if (!email || !password || !full_name || !role) {
      throw new AppError('Todos los campos son requeridos', 400);
    }

    const existing = await db('users').where({ email }).first();
    if (existing) throw new AppError('El email ya está registrado', 409);

    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db('users').insert({
      email, password_hash: passwordHash, full_name, role,
      organization_id: req.user.organizationId,
    }).returning(['id', 'email', 'full_name', 'role', 'is_active', 'created_at']);

    res.status(201).json({ success: true, data: user });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /auth/users:
 *   get:
 *     summary: Listar todos los usuarios (solo admin)
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Lista de usuarios del sistema
 *       401:
 *         description: No autenticado
 *       403:
 *         description: No autorizado (requiere rol admin)
 */
router.get('/users', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const users = await db('users')
      .where({ organization_id: req.user.organizationId })
      .select('id', 'email', 'full_name', 'role', 'is_active', 'last_login', 'created_at')
      .orderBy('created_at', 'desc');
    res.json({ success: true, data: users });
  } catch (err) { next(err); }
});

module.exports = router;
