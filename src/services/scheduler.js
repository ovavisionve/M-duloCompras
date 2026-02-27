const cron = require('node-cron');
const { fetchAndStoreBcvRate } = require('./exchangeRateService');
const logger = require('../utils/logger');

function initScheduledJobs() {
  // Fetch BCV rate daily at 9:00 AM Venezuela time (UTC-4 = 13:00 UTC)
  const schedule = process.env.BCV_CRON_SCHEDULE || '0 13 * * *';

  cron.schedule(schedule, async () => {
    logger.info('Scheduled job: fetching BCV exchange rate...');
    try {
      const result = await fetchAndStoreBcvRate();
      logger.info(`BCV rate fetched: ${result.rate} for ${result.date}`);
    } catch (err) {
      logger.error(`Scheduled BCV fetch failed: ${err.message}`);
    }
  });

  logger.info(`Scheduled BCV rate fetch: ${schedule}`);
}

module.exports = { initScheduledJobs };
