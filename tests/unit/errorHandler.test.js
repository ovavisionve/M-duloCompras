const { AppError, globalErrorHandler, notFoundHandler } = require('../../src/middleware/errorHandler');

// Mock logger to avoid console output during tests
jest.mock('../../src/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
}));

describe('AppError', () => {
  it('creates operational error with statusCode and code', () => {
    const err = new AppError('Not found', 404, 'NOT_FOUND');
    expect(err.message).toBe('Not found');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.isOperational).toBe(true);
    expect(err).toBeInstanceOf(Error);
  });

  it('defaults code to ERROR', () => {
    const err = new AppError('Algo falló', 500);
    expect(err.code).toBe('ERROR');
  });
});

describe('globalErrorHandler', () => {
  let req, res;

  beforeEach(() => {
    req = { path: '/test', method: 'GET' };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  it('handles operational errors with their status and message', () => {
    const err = new AppError('Factura no encontrada', 404, 'NOT_FOUND');
    globalErrorHandler(err, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Factura no encontrada' },
    });
  });

  it('hides internal error messages for non-operational errors', () => {
    const err = new Error('DB connection lost');
    globalErrorHandler(err, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' },
    });
  });
});

describe('notFoundHandler', () => {
  it('returns 404 with route info', () => {
    const req = { method: 'POST', path: '/api/missing' };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    notFoundHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Ruta no encontrada: POST /api/missing' },
    });
  });
});
