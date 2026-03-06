const axios = require('axios');
const https = require('https');
const cheerio = require('cheerio');
const db = require('../database/connection');
const logger = require('../utils/logger');

const BCV_URL = 'https://www.bcv.org.ve/';

// Agent that skips BCV's problematic SSL cert
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * Scrape BCV rate directly from bcv.org.ve
 */
async function scrapeBcvDirect() {
  const response = await axios.get(BCV_URL, {
    timeout: 15000,
    httpsAgent,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'es-VE,es;q=0.9,en;q=0.5',
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache',
    },
    maxRedirects: 5,
  });

  const $ = cheerio.load(response.data);
  let rateText = null;

  // Primary: div#dolar section with rate in <strong>
  const dolarSection = $('#dolar');
  if (dolarSection.length) {
    dolarSection.find('strong').each((_, el) => {
      const text = $(el).text().trim();
      if (/^\d+,\d+$/.test(text)) rateText = text;
    });
  }

  // Fallback: centrado divs or tasa-del-dia fields
  if (!rateText) {
    $('div.centrado strong, .views-field-field-tasa-del-dia-usd strong, .field-content strong').each((_, el) => {
      const text = $(el).text().trim();
      if (/^\d+,\d+$/.test(text)) rateText = text;
    });
  }

  // Last resort: regex on full body
  if (!rateText) {
    const body = $('body').text();
    const match = body.match(/USD\s*[\s\S]*?(\d{2,3},\d{4})/);
    if (match) rateText = match[1];
  }

  if (!rateText) throw new Error('No se pudo extraer tasa USD de bcv.org.ve');
  return parseFloat(rateText.replace(',', '.'));
}

/**
 * Fallback: fetch from pydolarve API (mirrors BCV official rate)
 */
async function fetchFromPyDolarApi() {
  const urls = [
    'https://pydolarve.org/api/v1/dollar?monitor=bcv',
    'https://ve.dolarapi.com/v1/dolares/oficial',
  ];

  for (const url of urls) {
    try {
      const response = await axios.get(url, { timeout: 10000 });
      const data = response.data;

      // pydolarve format: { price: 78.50, ... }
      if (data?.price) return parseFloat(data.price);
      // dolarapi format: { promedio: 78.50, ... } or { compra: 78.50 }
      if (data?.promedio) return parseFloat(data.promedio);
      if (data?.compra) return parseFloat(data.compra);
      // pydolarve array format
      if (Array.isArray(data) && data[0]?.price) return parseFloat(data[0].price);
    } catch {
      continue;
    }
  }
  throw new Error('Ninguna API de respaldo pudo obtener la tasa BCV');
}

/**
 * Fetch BCV rate and store it - tries direct scrape, then API fallback
 */
async function fetchAndStoreBcvRate() {
  let rate;
  let source = 'bcv_api';

  try {
    rate = await scrapeBcvDirect();
    logger.info(`BCV rate from direct scrape: ${rate}`);
  } catch (scrapeErr) {
    logger.warn(`Direct BCV scrape failed: ${scrapeErr.message}, trying API fallback...`);
    try {
      rate = await fetchFromPyDolarApi();
      source = 'bcv_api'; // Still BCV official rate, just fetched via API mirror
      logger.info(`BCV rate from API fallback: ${rate}`);
    } catch (apiErr) {
      logger.error(`All BCV rate sources failed. Scrape: ${scrapeErr.message}. API: ${apiErr.message}`);
      throw new Error('No se pudo obtener la tasa BCV de ninguna fuente');
    }
  }

  if (isNaN(rate) || rate < 1) {
    throw new Error(`Tasa BCV inválida: ${rate}`);
  }

  const today = new Date().toISOString().split('T')[0];

  const existing = await db('exchange_rates').where({ rate_date: today }).first();
  if (existing) {
    await db('exchange_rates').where({ id: existing.id }).update({ rate, source, updated_at: new Date() });
    logger.info(`BCV rate updated for ${today}: ${rate}`);
  } else {
    await db('exchange_rates').insert({ rate_date: today, rate, source });
    logger.info(`BCV rate stored for ${today}: ${rate}`);
  }

  return { date: today, rate, source };
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
 * Fetch Binance P2P USDT/VES rate (median of top sell ads)
 */
async function fetchBinanceP2PRate() {
  // Source 1: Binance P2P search API (undocumented but widely used)
  try {
    const response = await axios.post(
      'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search',
      {
        page: 1,
        rows: 20,
        payTypes: [],
        asset: 'USDT',
        tradeType: 'SELL',
        fiat: 'VES',
        publisherType: null,
        merchantCheck: false,
      },
      {
        timeout: 15000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      }
    );

    const ads = response.data?.data;
    if (Array.isArray(ads) && ads.length > 0) {
      const prices = ads.map(ad => parseFloat(ad.adv?.price)).filter(p => !isNaN(p) && p > 0);
      if (prices.length > 0) {
        prices.sort((a, b) => a - b);
        const median = prices[Math.floor(prices.length / 2)];
        logger.info(`Binance P2P rate (median of ${prices.length} ads): ${median}`);
        return median;
      }
    }
    throw new Error('No ads found in Binance P2P response');
  } catch (err) {
    logger.warn(`Binance P2P direct fetch failed: ${err.message}`);
  }

  // Source 2: pydolarve API with binance monitor
  const fallbackUrls = [
    'https://pydolarve.org/api/v1/dollar?monitor=binance',
    'https://pydolarve.org/api/v1/dollar?monitor=criptodolar',
  ];

  for (const url of fallbackUrls) {
    try {
      const response = await axios.get(url, { timeout: 10000 });
      const data = response.data;
      if (data?.price) return parseFloat(data.price);
      if (data?.promedio) return parseFloat(data.promedio);
      if (Array.isArray(data) && data[0]?.price) return parseFloat(data[0].price);
    } catch {
      continue;
    }
  }

  throw new Error('No se pudo obtener la tasa Binance P2P de ninguna fuente');
}

/**
 * Get today's Binance P2P rate (with caching)
 */
async function getTodayBinanceRate() {
  const today = new Date().toISOString().split('T')[0];
  const cacheKey = `binance_rate_${today}`;

  // Check in-memory cache (valid for 30 min)
  if (binanceRateCache[cacheKey] && (Date.now() - binanceRateCache[cacheKey].ts) < 30 * 60 * 1000) {
    return binanceRateCache[cacheKey].data;
  }

  try {
    const rate = await fetchBinanceP2PRate();
    const result = { rate_date: today, rate, source: 'binance_p2p' };
    binanceRateCache[cacheKey] = { data: result, ts: Date.now() };
    return result;
  } catch (err) {
    logger.error(`Failed to fetch Binance rate: ${err.message}`);
    // Return cached value even if expired
    if (binanceRateCache[cacheKey]) return binanceRateCache[cacheKey].data;
    return null;
  }
}

const binanceRateCache = {};

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

module.exports = { fetchAndStoreBcvRate, getRateForDate, getTodayRate, storeManualRate, getRateRange, fetchBinanceP2PRate, getTodayBinanceRate };
