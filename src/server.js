require('dotenv').config();
const app = require('./app');
const { initScheduledJobs } = require('./services/scheduler');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 7000;

async function start() {
  // Run pending migrations before starting the server
  try {
    const knex = require('./database/connection');
    const [batch, migrations] = await knex.migrate.latest();
    if (migrations.length) {
      logger.info(`Ran ${migrations.length} migration(s) in batch ${batch}:`);
      migrations.forEach((m) => logger.info(`  - ${m}`));
    }
  } catch (err) {
    logger.error('Migration failed:', err.message);
  }

  app.listen(PORT, () => {
    logger.info(`Comprar-IA API running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`Swagger docs: http://localhost:${PORT}/api-docs`);
    initScheduledJobs();
  });
}

start();
