const axios = require('axios');
const cheerio = require('cheerio');
const db = require('../database/connection');
const logger = require('../utils/logger');

const BCV_URL = 'https://www.bcv.org.ve/';

/**
 * Fetch BCV rate by scraping the official BCV website
 */
async function fetchAndStoreBcvRate() {
  try {
    const response = await axios.get(BCV_URL, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-VE,es;q=0.9,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
      },
    });

    const $ = cheerio.load(response.data);

    // BCV shows rates in div#dolar with the rate value in a <strong> tag
    let rateText = null;

    // Try primary selector: the USD rate section
    const dolarSection = $('#dolar');
    if (dolarSection.length) {
      const strongTags = dolarSection.find('strong');
      strongTags.each((_, el) => {
        const text = $(el).text().trim();
        // The rate looks like "78,5000" (comma as decimal separator)
        if (/^\d+,\d+$/.test(text)) {
          rateText = text;
        }
      });
    }

    // Fallback: look for the rate in the general exchange rate section
    if (!rateText) {
      $('div.centrado strong, div.views-field-field-tasa-del-dia-usd strong').each((_, el) => {
        const text = $(el).text().trim();
        if (/^\d+,\d+$/.test(text)) {
          rateText = text;
        }
      });
    }

    // Last fallback: search entire page for pattern matching BCV rate format
    if (!rateText) {
      const bodyText = $('body').text();
      const match = bodyText.match(/USD\s*[\s\S]*?(\d{2,3},\d{4})/);
      if (match) {
        rateText = match[1];
      }
    }

    if (!rateText) {
      throw new Error('No se pudo extraer la tasa USD del sitio del BCV');
    }

    // Convert "78,5000" -> 78.5000
    const rate = parseFloat(rateText.replace(',', '.'));
    if (isNaN(rate) || rate < 1) {
      throw new Error(`Tasa BCV inválida: ${rateText}`);
    }

    const today = new Date().toISOString().split('T')[0];

    const existing = await db('exchange_rates').where({ rate_date: today }).first();
    if (existing) {
      await db('exchange_rates').where({ id: existing.id }).update({ rate, source: 'bcv_api', updated_at: new Date() });
      logger.info(`BCV rate updated for ${today}: ${rate} (source: bcv.org.ve)`);
    } else {
      await db('exchange_rates').insert({ rate_date: today, rate, source: 'bcv_api' });
      logger.info(`BCV rate stored for ${today}: ${rate} (source: bcv.org.ve)`);
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
