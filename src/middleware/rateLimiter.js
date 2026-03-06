const rateLimit = require('express-rate-limit');

const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT || '100'),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT', message: 'Demasiadas solicitudes. Intente de nuevo en un minuto.' },
  },
});

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'AUTH_RATE_LIMIT', message: 'Demasiados intentos de login. Intente de nuevo en 15 minutos.' },
  },
});

module.exports = { apiRateLimiter, authRateLimiter };
