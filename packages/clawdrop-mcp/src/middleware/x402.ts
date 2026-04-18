/**
 * HTTP 402 Payment Required Middleware
 * 
 * Implements x402 protocol for Clawdrop transactions.
 * Intercepts requests, classifies transaction type, calculates fees,
 * and returns 402 if payment is required.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { classifyTransaction } from '../services/transaction-classifier';
import { calculateSwapFee, calculateTransferFee, calculateBookingFee, FEE_RATES } from '../services/fee-collector';

declare global {
  namespace Express {
    interface Request {
      clawdrop?: {
        transaction_type: 'swap' | 'flight' | 'transfer';
        transaction_confidence: number;
        fee_sol: number;
        fee_usd: number;
        fee_type: string;
        clawdrop_wallet: string;
      };
    }
  }
}

export interface X402Options {
  solPrice?: number;
  requirePayment?: boolean;
  allowBypass?: string[]; // Endpoints that don't require payment
}

const DEFAULT_OPTIONS: X402Options = {
  solPrice: 250,
  requirePayment: true,
  allowBypass: ['/health', '/api/health'],
};

/**
 * x402 Middleware - Calculates and enforces payment requirements
 */
export function x402Middleware(options: X402Options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Skip payment for exempt endpoints
      if (config.allowBypass?.includes(req.path)) {
        return next();
      }

      // Classify the transaction
      const classification = classifyTransaction(req);

      logger.debug({
        path: req.path,
        method: req.method,
        transaction_type: classification.type,
        confidence: classification.confidence,
      }, '[HFSP_X402_001] Transaction classified');

      // Calculate fee based on transaction type
      let feeCalc;
      let transactionAmount = 0;

      switch (classification.type) {
        case 'swap':
          // Extract swap amount from request
          transactionAmount = parseFloat(req.body?.amount_sol || '0');
          feeCalc = calculateSwapFee(transactionAmount, config.solPrice);
          break;

        case 'flight':
        case 'booking':
          // Extract booking amount from request
          const bookingValue = parseFloat(req.body?.amount_usd || req.body?.booking_amount || '0');
          feeCalc = calculateBookingFee(bookingValue, config.solPrice);
          break;

        case 'transfer':
        default:
          feeCalc = calculateTransferFee(config.solPrice);
          break;
      }

      // Attach fee info to request
      req.clawdrop = {
        transaction_type: classification.type,
        transaction_confidence: classification.confidence,
        fee_sol: feeCalc.fee_sol,
        fee_usd: feeCalc.fee_usd_estimate,
        fee_type: feeCalc.fee_percent,
        clawdrop_wallet: feeCalc.clawdrop_wallet,
      };

      logger.info({
        transaction_type: classification.type,
        fee_sol: feeCalc.fee_sol,
        fee_usd: feeCalc.fee_usd_estimate,
        fee_percent: feeCalc.fee_percent,
      }, '[HFSP_X402_002] Fee calculated');

      // Check if user can pay (basic check)
      const userWallet = req.body?.wallet_address || req.headers['x-wallet-address'] || '';

      if (config.requirePayment && !userWallet) {
        logger.warn({
          path: req.path,
          fee_sol: feeCalc.fee_sol,
        }, '[HFSP_X402_003] No wallet provided');

        return res.status(402).json({
          status: 'payment_required',
          error: 'Payment required - no wallet provided',
          fee: {
            type: classification.type,
            amount_sol: feeCalc.fee_sol,
            amount_usd: feeCalc.fee_usd_estimate,
            percent: feeCalc.fee_percent,
            clawdrop_wallet: feeCalc.clawdrop_wallet,
          },
          transaction: {
            type: classification.type,
            confidence: classification.confidence,
          },
          payment_instructions: {
            send_to: feeCalc.clawdrop_wallet,
            amount: feeCalc.fee_sol,
            memo: `[HFSP_${classification.type.toUpperCase()}_FEE]`,
          },
        });
      }

      // All checks passed - continue to next handler
      logger.debug({
        transaction_type: classification.type,
        wallet: userWallet?.substring(0, 8) + '...',
      }, '[HFSP_X402_004] Payment requirements satisfied');

      next();

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        path: req.path,
      }, '[HFSP_X402_ERR] x402 middleware error');

      res.status(500).json({
        status: 'error',
        error: 'Payment processing error',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

/**
 * Attach 402 headers to response
 * Call this after transaction succeeds to include fee info in response
 */
export function attachX402Headers(req: Request, res: Response): void {
  if (!req.clawdrop) return;

  res.setHeader('X-Payment-Required', 'true');
  res.setHeader('X-Fee-Type', req.clawdrop.transaction_type);
  res.setHeader('X-Fee-Amount-SOL', req.clawdrop.fee_sol.toString());
  res.setHeader('X-Fee-Amount-USD', req.clawdrop.fee_usd.toFixed(2));
  res.setHeader('X-Fee-Percent', req.clawdrop.fee_type);
  res.setHeader('X-Clawdrop-Wallet', req.clawdrop.clawdrop_wallet);
  res.setHeader('X-Transaction-Type', req.clawdrop.transaction_type);
  res.setHeader('X-Transaction-Confidence', req.clawdrop.transaction_confidence.toString());
}

/**
 * Respond with 402 Payment Required
 */
export function respond402(req: Request, res: Response, message?: string): void {
  if (!req.clawdrop) {
    res.status(402).json({ error: message || 'Payment required' });
    return;
  }

  const response = {
    status: 'payment_required',
    error: message || 'Payment required to complete transaction',
    fee: {
      type: req.clawdrop.transaction_type,
      amount_sol: req.clawdrop.fee_sol,
      amount_usd: req.clawdrop.fee_usd,
      percent: req.clawdrop.fee_type,
      clawdrop_wallet: req.clawdrop.clawdrop_wallet,
    },
    transaction: {
      type: req.clawdrop.transaction_type,
      confidence: req.clawdrop.transaction_confidence,
    },
    payment_instructions: {
      send_to: req.clawdrop.clawdrop_wallet,
      amount: req.clawdrop.fee_sol,
      memo: `[HFSP_${req.clawdrop.transaction_type.toUpperCase()}_FEE]`,
    },
  };

  attachX402Headers(req, res);
  res.status(402).json(response);
}
