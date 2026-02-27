const jwt = require('jsonwebtoken');
const db = require('../database/connection');
const { AppError } = require('./errorHandler');

/**
 * JWT authentication middleware
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AppError('Token de autenticación requerido', 401, 'AUTH_REQUIRED');
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');

    const user = await db('users').where({ id: decoded.userId, is_active: true }).first();
    if (!user) {
      throw new AppError('Usuario no encontrado o inactivo', 401, 'USER_INACTIVE');
    }

    req.user = { id: user.id, email: user.email, role: user.role, fullName: user.full_name };
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return next(new AppError('Token inválido o expirado', 401, 'TOKEN_INVALID'));
    }
    next(err);
  }
}

/**
 * API Key authentication middleware (for server-to-server)
 */
async function authenticateApiKey(req, res, next) {
  try {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return authenticate(req, res, next); // fallback to JWT

    const bcrypt = require('bcryptjs');
    const keys = await db('api_keys').where({ is_active: true });

    for (const key of keys) {
      if (await bcrypt.compare(apiKey, key.key_hash)) {
        const user = await db('users').where({ id: key.user_id, is_active: true }).first();
        if (!user) continue;
        req.user = { id: user.id, email: user.email, role: user.role, fullName: user.full_name };
        req.apiKeyScopes = key.scopes;
        return next();
      }
    }

    throw new AppError('API Key inválida', 401, 'API_KEY_INVALID');
  } catch (err) {
    next(err);
  }
}

/**
 * Role-based access control
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('No autenticado', 401, 'AUTH_REQUIRED'));
    }
    if (!roles.includes(req.user.role)) {
      return next(new AppError('No tiene permisos para esta acción', 403, 'FORBIDDEN'));
    }
    next();
  };
}

/**
 * Scope-based access for API keys
 */
function requireScope(scope) {
  return (req, res, next) => {
    if (req.apiKeyScopes && !req.apiKeyScopes.includes(scope)) {
      return next(new AppError(`Scope requerido: ${scope}`, 403, 'SCOPE_REQUIRED'));
    }
    next();
  };
}

module.exports = { authenticate, authenticateApiKey, authorize, requireScope };
