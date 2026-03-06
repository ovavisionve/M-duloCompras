/**
 * Venezuelan number formatting utilities.
 * Uses dots for thousands, comma for decimals (e.g., 60.000,00).
 */

/** Format a number with dots for thousands and comma for decimals */
export function fmtNum(n, decimals = 2) {
  const num = Number(n || 0);
  const fixed = Math.abs(num).toFixed(decimals);
  const [int, dec] = fixed.split('.');
  const intFormatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const sign = num < 0 ? '-' : '';
  return `${sign}${intFormatted},${dec}`;
}

/** Format an exchange rate (2-4 decimals) */
export function fmtRate(n) {
  if (!n) return '-';
  const num = Number(n);
  // Use up to 4 decimals, but at least 2
  const decimals = num % 1 === 0 ? 2 : Math.min(4, Math.max(2, String(num).split('.')[1]?.length || 2));
  const fixed = num.toFixed(decimals);
  const [int, dec] = fixed.split('.');
  const intFormatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${intFormatted},${dec}`;
}

/** Format a date as DD/MM/YYYY */
export function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}/${dt.getUTCFullYear()}`;
}

/** Format VES amount with prefix */
export function fmtVES(n) {
  return `Bs. ${fmtNum(n)}`;
}

/** Format USD amount with prefix */
export function fmtUSD(n) {
  return `$ ${fmtNum(n)}`;
}
