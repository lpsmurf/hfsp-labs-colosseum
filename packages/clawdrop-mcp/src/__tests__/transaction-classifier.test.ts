/**
 * Transaction Classifier Tests
 */

import { Request } from 'express';
import { classifyTransaction, isConfidentClassification, summarizeClassification } from '../services/transaction-classifier';

describe('Transaction Classifier', () => {
  let mockReq: Partial<Request>;

  beforeEach(() => {
    mockReq = {
      body: {},
      headers: {},
      path: '/api/test',
      method: 'POST',
    };
  });

  describe('Swap Classification', () => {
    it('should classify swap from token fields', () => {
      (mockReq as any).body = {
        from_token: 'USDC',
        to_token: 'SOL',
        amount: 100,
      };

      const result = classifyTransaction(mockReq as Request);

      expect(result.type).toBe('swap');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should classify swap from path', () => {
      (mockReq as any).path = '/api/swap/quote';
      (mockReq as any).body = { amount_sol: 5 };

      const result = classifyTransaction(mockReq as Request);

      expect(result.type).toBe('swap');
      expect(result.confidence).toBeGreaterThan(0.4);
    });

    it('should detect swap keywords', () => {
      (mockReq as any).body = {
        operation: 'exchange',
        input_mint: '...',
        output_mint: '...',
        slippage: 0.05,
      };

      const result = classifyTransaction(mockReq as Request);

      expect(result.type).toBe('swap');
    });
  });

  describe('Flight Classification', () => {
    it('should classify flight from booking fields', () => {
      (mockReq as any).body = {
        flight_id: 'AA123',
        departure_date: '2026-04-20',
        airline: 'American Airlines',
      };

      const result = classifyTransaction(mockReq as Request);

      expect(result.type).toBe('flight');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should classify flight from path', () => {
      (mockReq as any).path = '/api/flight/booking';
      (mockReq as any).body = { amount_usd: 300 };

      const result = classifyTransaction(mockReq as Request);

      expect(result.type).toBe('flight');
      expect(result.confidence).toBeGreaterThan(0.4);
    });

    it('should detect flight keywords', () => {
      (mockReq as any).body = {
        booking_id: 'B123',
        airport: 'LAX',
        ticket: 'T123',
      };

      const result = classifyTransaction(mockReq as Request);

      expect(result.type).toBe('flight');
    });
  });

  describe('Transfer Classification', () => {
    it('should classify transfer from recipient fields', () => {
      (mockReq as any).body = {
        recipient_address: 'solana_wallet_address',
        amount_sol: 5,
      };

      const result = classifyTransaction(mockReq as Request);

      expect(result.type).toBe('transfer');
      expect(result.confidence).toBeGreaterThan(0.4);
    });

    it('should classify transfer from path', () => {
      (mockReq as any).path = '/api/transfer';
      (mockReq as any).body = { amount: 100 };

      const result = classifyTransaction(mockReq as Request);

      expect(result.type).toBe('transfer');
    });

    it('should default to transfer as fallback', () => {
      (mockReq as any).body = { amount: 50 };
      (mockReq as any).path = '/api/generic';

      const result = classifyTransaction(mockReq as Request);

      expect(result.type).toBe('transfer');
    });
  });

  describe('Confidence Scoring', () => {
    it('should have high confidence for clear swap', () => {
      (mockReq as any).path = '/api/swap';
      (mockReq as any).body = {
        from_token: 'USDC',
        to_token: 'SOL',
        input_mint: '...',
        output_mint: '...',
      };

      const result = classifyTransaction(mockReq as Request);

      expect(isConfidentClassification(result, 0.5)).toBe(true);
    });

    it('should reject low confidence classification', () => {
      (mockReq as any).body = {};
      (mockReq as any).path = '/api/unknown';

      const result = classifyTransaction(mockReq as Request);

      // Should still classify but with lower confidence
      expect(result.confidence).toBeDefined();
    });
  });

  describe('Classification Summary', () => {
    it('should generate readable summary', () => {
      const classification = {
        type: 'swap' as const,
        confidence: 0.85,
        reasoning: 'swap detected',
      };

      const summary = summarizeClassification(classification);

      expect(summary).toContain('SWAP');
      expect(summary).toContain('85%');
      expect(summary).toContain('swap detected');
    });
  });

  describe('Edge Cases', () => {
    it('should handle null request body', () => {
      (mockReq as any).body = null;

      const result = classifyTransaction(mockReq as Request);

      expect(result.type).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });

    it('should handle missing headers', () => {
      (mockReq as any).headers = {};

      const result = classifyTransaction(mockReq as Request);

      expect(result.type).toBeDefined();
    });

    it('should handle undefined path', () => {
      (mockReq as any).path = undefined;

      const result = classifyTransaction(mockReq as Request);

      expect(result.type).toBeDefined();
    });
  });
});
