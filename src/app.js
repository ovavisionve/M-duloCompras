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
app.use(cors({ origin: process.env.CORS_ORIGINS?.split(',') || '*' }));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

// Rate limiting
app.use('/api/', apiRateLimiter);

// Static uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Swagger docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

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

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Error handling
app.use(notFoundHandler);
app.use(globalErrorHandler);

module.exports = app;
