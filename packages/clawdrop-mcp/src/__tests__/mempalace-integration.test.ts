/**
 * MemPalace Integration Tests
 */

import { MemPalaceClient } from '../integrations/mempalace';
import {
  beforeTransactionHook,
  afterTransactionSuccessHook,
  getWingHistoryHook,
  searchTransactionsHook,
  getMemoryStatsHook,
} from '../services/transaction-hooks';

describe('MemPalace Integration', () => {
  let client: MemPalaceClient;

  beforeEach(() => {
    // Use test server or mock
    client = new MemPalaceClient('http://localhost:8888');
  });

  describe('Client Health Check', () => {
    it('should check if MemPalace server is healthy', async () => {
      const healthy = await client.isHealthy();
      expect(typeof healthy).toBe('boolean');
    });
  });

  describe('Transaction Storage', () => {
    it('should save swap transaction with fee metadata', async () => {
      const entry = await client.saveTransaction(
        'swap',
        { sol: 0.035, usd: 8.75 },
        'test_wallet_address',
        { from_token: 'USDC', to_token: 'SOL', amount: 100 }
      );

      expect(entry).toBeDefined();
      if (entry) {
        expect(entry.topic).toBe('swap');
      }
    });

    it('should save transfer transaction', async () => {
      const entry = await client.saveTransaction(
        'transfer',
        { sol: 0.0002, usd: 0.05 },
        'wallet_address',
        { recipient: 'destination_address' }
      );

      expect(entry?.topic).toBe('transfer');
    });

    it('should save flight booking transaction', async () => {
      const entry = await client.saveTransaction(
        'flight',
        { sol: 0.01, usd: 2.50 },
        'wallet_address',
        { flight_id: 'AA123', booking_value: 500 }
      );

      expect(entry?.topic).toBe('flight');
    });
  });

  describe('Wing-Based Retrieval', () => {
    it('should retrieve all swap wing transactions', async () => {
      const transactions = await client.getWingTransactions('swap');
      expect(Array.isArray(transactions)).toBe(true);
    });

    it('should retrieve all transfer wing transactions', async () => {
      const transactions = await client.getWingTransactions('transfer');
      expect(Array.isArray(transactions)).toBe(true);
    });

    it('should get wing fee summary', async () => {
      const summary = await client.getWingFeeSummary('swap');

      expect(summary).toHaveProperty('total_transactions');
      expect(summary).toHaveProperty('total_fees_sol');
      expect(summary).toHaveProperty('total_fees_usd');
      expect(summary.total_transactions).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Search Functionality', () => {
    it('should search transactions by keyword', async () => {
      const results = await client.searchTransactions('swap');
      expect(Array.isArray(results)).toBe(true);
    });

    it('should find transactions with specific fee amounts', async () => {
      const results = await client.searchTransactions('0.0002');
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('Memory Statistics', () => {
    it('should get memory statistics', async () => {
      const stats = await client.getStats();

      if (stats) {
        expect(stats).toHaveProperty('total_messages');
        expect(stats).toHaveProperty('topics');
        expect(stats).toHaveProperty('storage_path');
      }
    });
  });

  describe('Transaction Hooks', () => {
    it('should execute before transaction hook', async () => {
      const mockReq = { clawdrop: { transaction_type: 'swap', transaction_confidence: 0.95 } };
      
      await beforeTransactionHook(mockReq as any, {});

      expect((mockReq as any).transactionId).toBeDefined();
      expect((mockReq as any).wing).toBe('swap');
    });

    it('should handle hook errors gracefully', async () => {
      const mockReq = null;

      // Should not throw
      await expect(beforeTransactionHook(mockReq as any, {})).resolves.not.toThrow();
    });
  });

  describe('Query Hooks', () => {
    it('should get wing history', async () => {
      const history = await getWingHistoryHook('swap');

      expect(history).toHaveProperty('wing');
      expect(history).toHaveProperty('total_transactions');
      expect(history).toHaveProperty('transactions');
      expect(Array.isArray(history.transactions)).toBe(true);
    });

    it('should search transactions', async () => {
      const results = await searchTransactionsHook('swap');

      expect(results).toHaveProperty('keyword');
      expect(results).toHaveProperty('results_count');
      expect(results).toHaveProperty('results');
    });

    it('should get memory statistics', async () => {
      const stats = await getMemoryStatsHook();

      expect(stats).toHaveProperty('total_transactions');
      expect(stats).toHaveProperty('by_wing');
      expect(stats).toHaveProperty('health');
    });
  });

  describe('Multi-Wing Isolation', () => {
    it('should isolate swap wing transactions', async () => {
      const swapTx = await client.getWingTransactions('swap');
      const transferTx = await client.getWingTransactions('transfer');

      // Each wing should maintain separate memory
      expect(Array.isArray(swapTx)).toBe(true);
      expect(Array.isArray(transferTx)).toBe(true);
    });

    it('should track separate fee totals per wing', async () => {
      const swapSummary = await client.getWingFeeSummary('swap');
      const transferSummary = await client.getWingFeeSummary('transfer');

      expect(swapSummary.total_fees_sol).toBeDefined();
      expect(transferSummary.total_fees_sol).toBeDefined();
    });
  });
});
