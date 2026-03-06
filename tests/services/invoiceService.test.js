// Mock DB before requiring the service
jest.mock('../../src/database/connection', () => {
  const knex = jest.fn();
  knex.raw = jest.fn();
  return knex;
});
jest.mock('../../src/services/auditService', () => ({ logAction: jest.fn() }));
jest.mock('../../src/services/webhookService', () => ({ emit: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }));

const { calculateTotals } = require('../../src/services/invoiceService');

describe('invoiceService.calculateTotals', () => {
  it('calculates VES invoice with 16% VAT', () => {
    const result = calculateTotals({
      taxable_amount: 1000,
      exempt_amount: 0,
      non_subject_amount: 0,
      vat_rate: 16,
      exchange_rate: 431.01,
      currency: 'VES',
    });

    expect(result.vat_amount).toBe(160);
    expect(result.total_amount).toBe(1160);
    expect(result.total_ves).toBe(1160);
    expect(result.total_usd).toBe(2.69); // 1160 / 431.01
  });

  it('calculates USD invoice converted to VES', () => {
    const result = calculateTotals({
      taxable_amount: 100,
      exempt_amount: 50,
      non_subject_amount: 0,
      vat_rate: 16,
      exchange_rate: 431.01,
      currency: 'USD',
    });

    expect(result.vat_amount).toBe(16);
    expect(result.total_amount).toBe(166);
    expect(result.total_usd).toBe(166);
    expect(result.total_ves).toBe(71547.66); // 166 * 431.01
  });

  it('handles 8% VAT (boleto KIU)', () => {
    const result = calculateTotals({
      taxable_amount: 500,
      exempt_amount: 0,
      non_subject_amount: 0,
      vat_rate: 8,
      exchange_rate: 431.01,
      currency: 'VES',
    });

    expect(result.vat_amount).toBe(40);
    expect(result.total_amount).toBe(540);
  });

  it('handles exempt-only invoice (0 VAT)', () => {
    const result = calculateTotals({
      taxable_amount: 0,
      exempt_amount: 2000,
      non_subject_amount: 0,
      vat_rate: 16,
      exchange_rate: 431.01,
      currency: 'VES',
    });

    expect(result.vat_amount).toBe(0);
    expect(result.total_amount).toBe(2000);
  });

  it('includes IGTF in total', () => {
    const result = calculateTotals({
      taxable_amount: 100,
      exempt_amount: 0,
      non_subject_amount: 0,
      vat_rate: 16,
      exchange_rate: 431.01,
      currency: 'USD',
      igtf_amount: 3,
    });

    expect(result.vat_amount).toBe(16);
    expect(result.total_amount).toBe(119); // 100 + 16 + 3
  });

  it('handles mixed amounts (taxable + exempt + non-subject)', () => {
    const result = calculateTotals({
      taxable_amount: 1000,
      exempt_amount: 500,
      non_subject_amount: 200,
      vat_rate: 16,
      exchange_rate: 431.01,
      currency: 'VES',
    });

    expect(result.vat_amount).toBe(160);
    expect(result.total_amount).toBe(1860); // 1000 + 500 + 200 + 160
  });
});
