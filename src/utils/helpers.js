/**
 * Validate Venezuelan RIF format: V/J/E/G-XXXXXXXX-X
 */
function validateRif(rif) {
  return /^[VJEGP]-\d{8}-\d$/.test(rif);
}

/**
 * Validate control number format: 00-XXXXXXXX
 */
function validateControlNumber(num) {
  return /^\d{2}-\d{8}$/.test(num);
}

/**
 * Format fiscal period from date: MM/YYYY
 */
function fiscalPeriodFromDate(date) {
  const d = new Date(date);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${month}/${d.getFullYear()}`;
}

/**
 * Parse fiscal period string to { month, year }
 */
function parseFiscalPeriod(period) {
  const [month, year] = period.split('/');
  return { month: parseInt(month), year: parseInt(year) };
}

/**
 * Round to 2 decimals
 */
function round2(n) {
  return Math.round((parseFloat(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Generate withholding voucher number: YYYY-XXXXXXXX
 */
function generateVoucherNumber(year, counter) {
  return `${year}-${String(counter).padStart(8, '0')}`;
}

/**
 * Build paginated response
 */
function paginate(data, total, page, limit) {
  return {
    data,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit),
    },
  };
}

/**
 * Format date to dd/mm/yyyy
 */
function fmtDateISO(d) {
  if (!d) return '';
  const dt = new Date(d);
  return `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}/${dt.getUTCFullYear()}`;
}

module.exports = {
  validateRif,
  validateControlNumber,
  fiscalPeriodFromDate,
  parseFiscalPeriod,
  round2,
  generateVoucherNumber,
  paginate,
  fmtDateISO,
};
