/**
 * Tests for bankingService with mocked DB
 */

// Setup mock chain helpers
function createChainMock(finalValue) {
  const chain = {};
  const methods = ['where', 'whereNotNull', 'whereNull', 'whereBetween', 'andWhere', 'select', 'leftJoin', 'first', 'update', 'insert', 'returning', 'count'];
  for (const method of methods) {
    chain[method] = jest.fn().mockReturnValue(chain);
  }
  chain.first = jest.fn().mockResolvedValue(finalValue);
  return chain;
}

const mockDb = jest.fn();
mockDb.raw = jest.fn();
jest.mock('../../src/database/connection', () => mockDb);
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../../src/services/auditService', () => ({ logAction: jest.fn() }));

const bankingService = require('../../src/services/bankingService');
const { AppError } = require('../../src/middleware/errorHandler');

describe('bankingService', () => {
  afterEach(() => jest.clearAllMocks());

  describe('importMovements', () => {
    it('inserts movements for a valid bank account', async () => {
      const account = { id: 'acct-1', bank_name: 'BFC' };
      const mockInserted = { id: 'mov-1', bank_account_id: 'acct-1', debit: 100, credit: 0 };

      const chain = createChainMock(account);
      chain.returning = jest.fn().mockResolvedValue([mockInserted]);
      chain.insert = jest.fn().mockReturnValue(chain);
      mockDb.mockReturnValue(chain);

      const movements = [{ date: '2026-03-06', reference: 'REF-001', debit: '100', credit: '0' }];
      const result = await bankingService.importMovements('acct-1', movements);

      expect(result.imported).toBe(1);
      expect(result.movements).toHaveLength(1);
    });

    it('throws 404 for non-existent account', async () => {
      const chain = createChainMock(null);
      mockDb.mockReturnValue(chain);

      await expect(
        bankingService.importMovements('bad-id', [])
      ).rejects.toThrow('Cuenta bancaria no encontrada');
    });
  });

  describe('getReconciliationReport', () => {
    it('throws 404 for non-existent account', async () => {
      const chain = createChainMock(null);
      mockDb.mockReturnValue(chain);

      await expect(
        bankingService.getReconciliationReport('bad-id', '03/2026')
      ).rejects.toThrow('Cuenta bancaria no encontrada');
    });
  });

  describe('manualReconcile', () => {
    it('throws 404 when movement not found', async () => {
      const chain = createChainMock(null);
      mockDb.mockReturnValue(chain);

      await expect(
        bankingService.manualReconcile('bad-mov', 'pay-1', 'user-1', '127.0.0.1')
      ).rejects.toThrow('Movimiento no encontrado');
    });
  });
});
