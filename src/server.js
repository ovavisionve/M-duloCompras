require('dotenv').config();

// ─── Validate required environment variables ───
const REQUIRED_ENV = ['JWT_SECRET'];
const missing = REQUIRED_ENV.filter((v) => !process.env[v]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  console.error('Set them in .env or as environment variables before starting.');
  process.exit(1);
}

const app = require('./app');
const { initScheduledJobs } = require('./services/scheduler');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 7000;

async function start() {
  // Run pending migrations before starting the server
  const knex = require('./database/connection');
  try {
    // Clear any stale migration lock from a previous failed deploy
    try {
      await knex.migrate.forceFreeMigrationsLock();
    } catch (lockErr) {
      // Lock table may not exist yet on first run
    }
    const [batch, migrations] = await knex.migrate.latest();
    if (migrations.length) {
      logger.info(`Ran ${migrations.length} migration(s) in batch ${batch}:`);
      migrations.forEach((m) => logger.info(`  - ${m}`));
    }
  } catch (err) {
    logger.error('Migration failed:', err.message);
    logger.error(err.stack);
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    logger.info(`Comprar-IA API running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`Swagger docs: http://localhost:${PORT}/api-docs`);
    initScheduledJobs();
  });

  // ─── Graceful shutdown ───
  let isShuttingDown = false;
  const shutdown = async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info(`${signal} received, shutting down gracefully...`);

    server.close(async () => {
      logger.info('HTTP server closed');
      try {
        await knex.destroy();
        logger.info('Database connections closed');
      } catch (err) {
        logger.error('Error closing DB:', err.message);
      }
      process.exit(0);
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after 30s timeout');
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();
