const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/connection');
const { authenticate, authorize } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const auditService = require('../services/auditService');

// POST /auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) throw new AppError('Email y contraseña requeridos', 400, 'MISSING_CREDENTIALS');

    const user = await db('users').where({ email, is_active: true }).first();
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new AppError('Credenciales inválidas', 401, 'INVALID_CREDENTIALS');
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET || 'dev-secret',
      { expiresIn: process.env.JWT_EXPIRATION || '8h' }
    );

    const refreshToken = jwt.sign(
      { userId: user.id, type: 'refresh' },
      process.env.JWT_SECRET || 'dev-secret',
      { expiresIn: process.env.JWT_REFRESH_EXPIRATION || '7d' }
    );

    await db('users').where({ id: user.id }).update({ last_login: new Date() });
    await auditService.logAction(user.id, 'user', user.id, 'login', null, null, req.ip);

    res.json({
      success: true,
      data: {
        token,
        refreshToken,
        user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role },
      },
    });
  } catch (err) { next(err); }
});

// POST /auth/refresh
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) throw new AppError('Refresh token requerido', 400);

    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET || 'dev-secret');
    if (decoded.type !== 'refresh') throw new AppError('Token inválido', 401);

    const user = await db('users').where({ id: decoded.userId, is_active: true }).first();
    if (!user) throw new AppError('Usuario no encontrado', 401);

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET || 'dev-secret',
      { expiresIn: process.env.JWT_EXPIRATION || '8h' }
    );

    res.json({ success: true, data: { token } });
  } catch (err) { next(err); }
});

// GET /auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({ success: true, data: req.user });
});

// POST /auth/users (admin only)
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
    }).returning(['id', 'email', 'full_name', 'role', 'is_active', 'created_at']);

    res.status(201).json({ success: true, data: user });
  } catch (err) { next(err); }
});

// GET /auth/users
router.get('/users', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const users = await db('users')
      .select('id', 'email', 'full_name', 'role', 'is_active', 'last_login', 'created_at')
      .orderBy('created_at', 'desc');
    res.json({ success: true, data: users });
  } catch (err) { next(err); }
});

module.exports = router;
