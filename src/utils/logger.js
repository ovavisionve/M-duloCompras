const winston = require('winston');
const path = require('path');
const fs = require('fs');

const transports = [
  new winston.transports.Console({
    format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
  }),
];

// Add file transports only if LOG_DIR is explicitly set and writable
if (process.env.LOG_DIR) {
  try {
    const logDir = process.env.LOG_DIR;
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    transports.push(
      new winston.transports.File({ filename: path.join(logDir, 'error.log'), level: 'error' }),
      new winston.transports.File({ filename: path.join(logDir, 'combined.log') }),
    );
  } catch {
    // Filesystem not writable, skip file transports
  }
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
