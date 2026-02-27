require('dotenv').config();
const app = require('./app');
const { initScheduledJobs } = require('./services/scheduler');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  logger.info(`Módulo de Compras API running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Swagger docs: http://localhost:${PORT}/api-docs`);
  initScheduledJobs();
});
