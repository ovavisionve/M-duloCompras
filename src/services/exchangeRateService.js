const axios = require('axios');
const db = require('../database/connection');
const logger = require('../utils/logger');

const BCV_API_URL = process.env.BCV_API_URL || 'https://pydolarvenezuela-api.vercel.app/api/v1/dollar';

/**
 * Fetch BCV rate from external API and store it
 */
async function fetchAndStoreBcvRate() {
  try {
    const response = await axios.get(BCV_API_URL, { timeout: 10000 });
    const monitors = response.data?.monitors;
    const bcvData = monitors?.bcv;

    if (!bcvData?.price) {
      throw new Error('BCV rate not found in API response');
    }

    const rate = parseFloat(bcvData.price);
    const today = new Date().toISOString().split('T')[0];

    const existing = await db('exchange_rates').where({ rate_date: today }).first();
    if (existing) {
      await db('exchange_rates').where({ id: existing.id }).update({ rate, source: 'bcv_api', updated_at: new Date() });
      logger.info(`BCV rate updated for ${today}: ${rate}`);
    } else {
      await db('exchange_rates').insert({ rate_date: today, rate, source: 'bcv_api' });
      logger.info(`BCV rate stored for ${today}: ${rate}`);
    }

    return { date: today, rate, source: 'bcv_api' };
  } catch (err) {
    logger.error(`Failed to fetch BCV rate: ${err.message}`);
    throw err;
  }
}

/**
 * Get rate for a specific date; fallback to the closest previous date
 */
async function getRateForDate(date) {
  const rate = await db('exchange_rates')
    .where('rate_date', '<=', date)
    .orderBy('rate_date', 'desc')
    .first();
  return rate || null;
}

/**
 * Get today's rate
 */
async function getTodayRate() {
  const today = new Date().toISOString().split('T')[0];
  let rate = await db('exchange_rates').where({ rate_date: today }).first();
  if (!rate) {
    try {
      const result = await fetchAndStoreBcvRate();
      rate = { rate_date: result.date, rate: result.rate, source: result.source };
    } catch {
      rate = await getRateForDate(today);
    }
  }
  return rate;
}

/**
 * Store a manual rate
 */
async function storeManualRate(date, rateValue, userId) {
  const existing = await db('exchange_rates').where({ rate_date: date }).first();
  if (existing) {
    await db('exchange_rates').where({ id: existing.id }).update({
      rate: rateValue,
      source: 'manual',
      created_by: userId,
      updated_at: new Date(),
    });
    return { ...existing, rate: rateValue, source: 'manual' };
  }
  const [inserted] = await db('exchange_rates').insert({
    rate_date: date,
    rate: rateValue,
    source: 'manual',
    created_by: userId,
  }).returning('*');
  return inserted;
}

/**
 * Get rate range
 */
async function getRateRange(from, to) {
  return db('exchange_rates')
    .whereBetween('rate_date', [from, to])
    .orderBy('rate_date', 'asc');
}

module.exports = { fetchAndStoreBcvRate, getRateForDate, getTodayRate, storeManualRate, getRateRange };
