/**
 * Tests for treasury FX calculation logic.
 * These verify the core math without touching the DB.
 */
const { round2 } = require('../../src/utils/helpers');

// Re-implement the calculation logic from createOperation to test it independently
function calculateFxOperation(amountVes, bcvRate, purchaseRate) {
  const ves = parseFloat(amountVes);
  const bcv = parseFloat(bcvRate);
  const pRate = parseFloat(purchaseRate);

  const amountUsd = round2(ves / pRate);
  const usdAtBcv = round2(ves / bcv);
  const diffUsd = round2(amountUsd - usdAtBcv);
  const diffVes = round2(diffUsd * bcv);

  return { amountUsd, usdAtBcv, diffUsd, diffVes };
}

describe('Treasury FX Calculations', () => {
  describe('calculateFxOperation', () => {
    it('calculates loss when purchase rate > BCV rate', () => {
      // Buying at 629 (Binance) vs 431 (BCV) = loss
      const result = calculateFxOperation(500000, 431.01, 629);

      expect(result.amountUsd).toBe(round2(500000 / 629));
      expect(result.usdAtBcv).toBe(round2(500000 / 431.01));
      expect(result.diffUsd).toBe(round2(result.amountUsd - result.usdAtBcv));
      expect(result.diffUsd).toBeLessThan(0);       // loss
      expect(result.diffVes).toBeLessThan(0);        // loss in VES too
    });

    it('calculates gain when purchase rate < BCV rate', () => {
      // Buying at 400 vs BCV 431 = gain (got more USD per VES)
      const result = calculateFxOperation(100000, 431.01, 400);

      expect(result.amountUsd).toBe(250);        // 100000 / 400
      expect(result.usdAtBcv).toBe(232.01);      // 100000 / 431.01
      expect(result.diffUsd).toBeGreaterThan(0);  // gain
      expect(result.diffVes).toBeGreaterThan(0);  // gain in VES
    });

    it('calculates zero diff when rates are equal', () => {
      const result = calculateFxOperation(100000, 500, 500);

      expect(result.amountUsd).toBe(200);
      expect(result.usdAtBcv).toBe(200);
      expect(result.diffUsd).toBe(0);
      expect(result.diffVes).toBe(0);
    });

    it('handles the WEFLY typical scenario (BCV ~431, Binance ~629)', () => {
      // 300,000 VES at Binance 629 vs BCV 431.01
      const result = calculateFxOperation(300000, 431.01, 629);

      expect(result.amountUsd).toBe(round2(300000 / 629));
      expect(result.usdAtBcv).toBe(round2(300000 / 431.01));
      // Loss: paid at higher parallel rate so got fewer USD
      expect(result.diffUsd).toBe(round2(result.amountUsd - result.usdAtBcv));
      expect(result.diffUsd).toBeLessThan(0);
    });

    it('handles small amounts correctly', () => {
      const result = calculateFxOperation(1000, 431.01, 629);

      expect(result.amountUsd).toBe(1.59);
      expect(result.usdAtBcv).toBe(2.32);
    });

    it('handles large amounts without overflow', () => {
      const result = calculateFxOperation(50000000, 431.01, 629);

      expect(result.amountUsd).toBe(round2(50000000 / 629));
      expect(typeof result.diffVes).toBe('number');
      expect(isFinite(result.diffVes)).toBe(true);
    });
  });

  describe('Revaluation logic', () => {
    it('calculates revaluation when BCV rate changes', () => {
      // Entry: 500,000 VES at BCV 430 = 1,162.79 USD
      const entryUsd = round2(500000 / 430);
      expect(entryUsd).toBe(1162.79);

      // Today: BCV 435 = 1,149.43 USD
      const todayUsd = round2(500000 / 435);
      expect(todayUsd).toBe(1149.43);

      // Revaluation loss (BCV went up = VES worth less in USD)
      const revaluation = round2(todayUsd - entryUsd);
      expect(revaluation).toBeLessThan(0);
    });

    it('calculates revaluation gain when BCV drops', () => {
      // Entry: 500,000 VES at BCV 435 = 1,149.43 USD
      const entryUsd = round2(500000 / 435);

      // Today: BCV 425 = 1,176.47 USD (VES strengthened)
      const todayUsd = round2(500000 / 425);

      const revaluation = round2(todayUsd - entryUsd);
      expect(revaluation).toBeGreaterThan(0);
    });
  });

  describe('Spread calculation (Binance vs BCV)', () => {
    it('calculates correct spread percentage', () => {
      const bcv = 431.01;
      const binance = 629;

      // Spread = ((binance - bcv) / bcv) * 100
      const spread = round2(((binance - bcv) / bcv) * 100);
      expect(spread).toBe(45.94);
      expect(spread).toBeGreaterThan(40);
      expect(spread).toBeLessThan(60);
    });

    it('spread is zero when rates are equal', () => {
      const rate = 431.01;
      const spread = round2(((rate - rate) / rate) * 100);
      expect(spread).toBe(0);
    });
  });
});
