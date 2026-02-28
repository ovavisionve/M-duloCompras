const winston = require('winston');
const path = require('path');
const fs = require('fs');

const transports = [
  new winston.transports.Console({
    format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
  }),
];

// Only add file transports if not in production cloud (where filesystem may be read-only)
if (process.env.NODE_ENV !== 'production') {
  const logDir = process.env.LOG_DIR || './logs';
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  transports.push(
    new winston.transports.File({ filename: path.join(logDir, 'error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join(logDir, 'combined.log') }),
  );
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'comprar-ia' },
  transports,
});

module.exports = logger;
