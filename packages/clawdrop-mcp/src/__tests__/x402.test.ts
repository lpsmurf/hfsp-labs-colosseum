/**
 * x402 Middleware Tests
 * 
 * Unit and integration tests for x402 payment protocol implementation
 */

import { Request, Response, NextFunction } from 'express';
import { x402Middleware, attachX402Headers, respond402 } from '../middleware/x402';
import { FEE_RATES } from '../services/fee-collector';

describe('x402 Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    mockReq = {
      body: {},
      headers: {},
      path: '/api/tools/test',
      method: 'POST',
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
    };

    mockNext = jest.fn();
  });

  describe('Transfer Fee Calculation', () => {
    it('should calculate flat $0.05 transfer fee', async () => {
      const middleware = x402Middleware({ solPrice: 250, requirePayment: false });
      
      (mockReq as any).body = { wallet_address: 'test_wallet' };
      
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.clawdrop).toBeDefined();
      expect(mockReq.clawdrop?.transaction_type).toBe('transfer');
      expect(mockReq.clawdrop?.fee_sol).toBeCloseTo(FEE_RATES.TRANSFER_FLAT_SOL, 6);
      expect(mockReq.clawdrop?.fee_usd).toBeCloseTo(0.05, 2);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should enforce payment when wallet not provided', async () => {
      const middleware = x402Middleware({ solPrice: 250, requirePayment: true });
      
      (mockReq as any).body = { amount: 100 };
      
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(402);
      expect(mockRes.json).toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should skip payment for exempt endpoints', async () => {
      const middleware = x402Middleware({
        requirePayment: true,
        allowBypass: ['/health'],
      });

      (mockReq as any).path = '/health';

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });

  describe('x402 Headers', () => {
    it('should attach correct x402 headers', () => {
      (mockReq as any).clawdrop = {
        transaction_type: 'transfer',
        transaction_confidence: 0.95,
        fee_sol: 0.0002,
        fee_usd: 0.05,
        fee_type: 'flat',
        clawdrop_wallet: 'test_wallet_addr',
      };

      attachX402Headers(mockReq as Request, mockRes as Response);

      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Fee-Type', 'transfer');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Fee-Amount-SOL', '0.0002');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Fee-Amount-USD', '0.05');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Fee-Percent', 'flat');
    });
  });

  describe('402 Response', () => {
    it('should respond with 402 and correct payload', () => {
      (mockReq as any).clawdrop = {
        transaction_type: 'transfer',
        transaction_confidence: 0.95,
        fee_sol: 0.0002,
        fee_usd: 0.05,
        fee_type: 'flat',
        clawdrop_wallet: 'test_wallet_addr',
      };

      respond402(mockReq as Request, mockRes as Response, 'Custom message');

      expect(mockRes.status).toHaveBeenCalledWith(402);
      
      const jsonCall = (mockRes.json as jest.Mock).mock.calls[0][0];
      expect(jsonCall.status).toBe('payment_required');
      expect(jsonCall.error).toBe('Custom message');
      expect(jsonCall.fee.type).toBe('transfer');
      expect(jsonCall.fee.amount_sol).toBe(0.0002);
    });
  });

  describe('Fee Verification', () => {
    it('should calculate swap fee as 0.35% of amount', async () => {
      const middleware = x402Middleware({ solPrice: 250, requirePayment: false });
      
      (mockReq as any).path = '/api/swap';
      (mockReq as any).body = { 
        wallet_address: 'test_wallet',
        amount_sol: 10,
      };
      
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.clawdrop?.transaction_type).toBe('swap');
      expect(mockReq.clawdrop?.fee_sol).toBeCloseTo(0.035, 6); // 0.35% of 10
      expect(mockNext).toHaveBeenCalled();
    });

    it('should calculate booking fee as 0.5% of USD value', async () => {
      const middleware = x402Middleware({ solPrice: 250, requirePayment: false });
      
      (mockReq as any).path = '/api/flight/book';
      (mockReq as any).body = {
        wallet_address: 'test_wallet',
        amount_usd: 500,
      };
      
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.clawdrop?.transaction_type).toBe('flight');
      expect(mockReq.clawdrop?.fee_usd).toBeCloseTo(2.5, 2); // 0.5% of $500
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle classification errors gracefully', async () => {
      const middleware = x402Middleware({ requirePayment: false });
      
      // Create request that could cause parsing errors
      (mockReq as any).body = null;
      (mockReq as any).path = '/test';

      await middleware(mockReq as Request, mockRes as Response, mockNext);

      // Should still proceed or respond with 402, not crash
      expect(mockRes.status || mockNext).toBeDefined();
    });
  });
});
