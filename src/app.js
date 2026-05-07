const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const { globalErrorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { apiRateLimiter } = require('./middleware/rateLimiter');

const app = express();

// Security & parsing
app.use(helmet());
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  : ['http://localhost:5173', 'http://localhost:10000'];
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

// Rate limiting
app.use('/api/', apiRateLimiter);

// Static uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Swagger docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Comprar-IA API Docs',
}));
app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));

// API Routes
app.use('/api/v1/auth', require('./routes/auth'));
app.use('/api/v1/suppliers', require('./routes/suppliers'));
app.use('/api/v1/invoices', require('./routes/invoices'));
app.use('/api/v1/withholdings', require('./routes/withholdings'));
app.use('/api/v1/payments', require('./routes/payments'));
app.use('/api/v1/purchase-book', require('./routes/purchaseBook'));
app.use('/api/v1/banking', require('./routes/banking'));
app.use('/api/v1/exchange-rates', require('./routes/exchangeRates'));
app.use('/api/v1/config', require('./routes/config'));
app.use('/api/v1/reports', require('./routes/reports'));
app.use('/api/v1/webhooks', require('./routes/webhooks'));
app.use('/api/v1/dashboard', require('./routes/dashboard'));
app.use('/api/v1/treasury', require('./routes/treasury'));
app.use('/api/v1/credit-notes', require('./routes/creditNotes'));
app.use('/api/v1/wave', require('./routes/wave'));
app.use('/api/v1/bfc', require('./routes/bfcBank'));
app.use('/api/v1/portal', require('./routes/portal'));

// Health check with DB connectivity
app.get('/health', async (req, res) => {
  try {
    const db = require('./database/connection');
    await db.raw('SELECT 1');
    res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString(), uptime: process.uptime() });
  } catch (err) {
    res.status(503).json({ status: 'error', database: 'disconnected', error: err.message, timestamp: new Date().toISOString() });
  }
});

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../frontend/dist');
  app.use(express.static(frontendPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// Error handling
app.use(notFoundHandler);
app.use(globalErrorHandler);

module.exports = app;
