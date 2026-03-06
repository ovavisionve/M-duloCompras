const {
  validateRif,
  validateControlNumber,
  fiscalPeriodFromDate,
  parseFiscalPeriod,
  round2,
  generateVoucherNumber,
  paginate,
  fmtDateISO,
} = require('../../src/utils/helpers');

describe('helpers', () => {
  describe('validateRif', () => {
    it('accepts valid RIFs', () => {
      expect(validateRif('J-50315995-2')).toBe(true);
      expect(validateRif('V-12345678-0')).toBe(true);
      expect(validateRif('E-87654321-9')).toBe(true);
      expect(validateRif('G-00000001-1')).toBe(true);
      expect(validateRif('P-11111111-5')).toBe(true);
    });

    it('rejects invalid RIFs', () => {
      expect(validateRif('')).toBe(false);
      expect(validateRif('X-12345678-0')).toBe(false);
      expect(validateRif('J-1234567-0')).toBe(false);   // 7 digits
      expect(validateRif('J-123456789-0')).toBe(false);  // 9 digits
      expect(validateRif('J1234567890')).toBe(false);     // no dashes
      expect(validateRif('J-12345678-')).toBe(false);     // missing check digit
    });
  });

  describe('validateControlNumber', () => {
    it('accepts valid control numbers', () => {
      expect(validateControlNumber('00-00000001')).toBe(true);
      expect(validateControlNumber('99-99999999')).toBe(true);
    });

    it('rejects invalid control numbers', () => {
      expect(validateControlNumber('')).toBe(false);
      expect(validateControlNumber('0-00000001')).toBe(false);
      expect(validateControlNumber('00-0000001')).toBe(false);
      expect(validateControlNumber('000-00000001')).toBe(false);
      expect(validateControlNumber('00-000000001')).toBe(false);
    });
  });

  describe('fiscalPeriodFromDate', () => {
    it('formats dates to MM/YYYY', () => {
      expect(fiscalPeriodFromDate('2026-03-06')).toBe('03/2026');
      expect(fiscalPeriodFromDate('2025-12-25')).toBe('12/2025');
      expect(fiscalPeriodFromDate('2026-01-01')).toBe('01/2026');
    });
  });

  describe('parseFiscalPeriod', () => {
    it('parses MM/YYYY to object', () => {
      expect(parseFiscalPeriod('03/2026')).toEqual({ month: 3, year: 2026 });
      expect(parseFiscalPeriod('12/2025')).toEqual({ month: 12, year: 2025 });
    });
  });

  describe('round2', () => {
    it('rounds to 2 decimals', () => {
      expect(round2(1.005)).toBe(1.01);
      expect(round2(1.004)).toBe(1);
      expect(round2(100.999)).toBe(101);
      expect(round2(0.1 + 0.2)).toBe(0.3);
    });

    it('handles strings', () => {
      expect(round2('123.456')).toBe(123.46);
    });

    it('handles zero and integers', () => {
      expect(round2(0)).toBe(0);
      expect(round2(42)).toBe(42);
    });
  });

  describe('generateVoucherNumber', () => {
    it('formats YYYY-XXXXXXXX', () => {
      expect(generateVoucherNumber(2026, 1)).toBe('2026-00000001');
      expect(generateVoucherNumber(2026, 12345)).toBe('2026-00012345');
      expect(generateVoucherNumber(2026, 99999999)).toBe('2026-99999999');
    });
  });

  describe('paginate', () => {
    it('builds paginated response', () => {
      const result = paginate(['a', 'b'], 10, 1, 2);
      expect(result).toEqual({
        data: ['a', 'b'],
        pagination: { total: 10, page: 1, limit: 2, pages: 5 },
      });
    });

    it('handles string page/limit', () => {
      const result = paginate([], 0, '3', '25');
      expect(result.pagination.page).toBe(3);
      expect(result.pagination.limit).toBe(25);
      expect(result.pagination.pages).toBe(0);
    });

    it('calculates pages correctly', () => {
      const result = paginate([], 7, 1, 3);
      expect(result.pagination.pages).toBe(3);
    });
  });

  describe('fmtDateISO', () => {
    it('formats to dd/mm/yyyy', () => {
      expect(fmtDateISO('2026-03-06')).toBe('06/03/2026');
      expect(fmtDateISO('2025-12-25')).toBe('25/12/2025');
    });

    it('returns empty string for falsy input', () => {
      expect(fmtDateISO(null)).toBe('');
      expect(fmtDateISO(undefined)).toBe('');
      expect(fmtDateISO('')).toBe('');
    });
  });
});
