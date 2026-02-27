const logger = require('../utils/logger');

class AppError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code || 'ERROR';
    this.isOperational = true;
  }
}

function globalErrorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const message = err.isOperational ? err.message : 'Error interno del servidor';

  logger.error({ message: err.message, stack: err.stack, path: req.path, method: req.method });

  res.status(statusCode).json({
    success: false,
    error: { code: err.code || 'INTERNAL_ERROR', message },
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Ruta no encontrada: ${req.method} ${req.path}` },
  });
}

module.exports = { AppError, globalErrorHandler, notFoundHandler };
