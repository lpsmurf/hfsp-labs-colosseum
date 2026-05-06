/**
 * HTTP 402 Payment Required Middleware
 *
 * Implements x402 protocol for Clawdrop transactions.
 * Intercepts requests, classifies transaction type, calculates fees,
 * and returns 402 if payment is required.
 *
 * Spec-compliant: returns WWW-Authenticate: x402 header with
 * base64-encoded payment requirements JSON.
 */

import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { classifyTransaction } from '../services/transaction-classifier';
import { calculateSwapFee, calculateTransferFee, calculateFlightFee, FEE_RATES } from '../services/fee-collector';

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

const PLATFORM_WALLET = process.env.CLAWDROP_FEE_WALLET || process.env.CLAWDROP_WALLET_ADDRESS || '';

interface PaymentRequirements {
  version: string;
  accepts: Array<{
    scheme: string;
    network: string;
    asset: string;
    maxAmountRequired: string;
    extra: {
      recipient: string;
      memo: string;
    };
  }>;
}

function buildPaymentRequirements(feeSol: number): PaymentRequirements {
  // Convert SOL fee to lamports for maxAmountRequired
  const maxAmountLamports = Math.ceil(feeSol * 1e9).toString();
  return {
    version: 'x402/1',
    accepts: [
      {
        scheme: 'exact',
        network: 'solana-mainnet',
        asset: 'SOL',
        maxAmountRequired: maxAmountLamports,
        extra: {
          recipient: PLATFORM_WALLET,
          memo: 'clawdrop-api',
        },
      },
    ],
  };
}

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

      // Check for payment proof header (X-Payment)
      const paymentProof = req.headers['x-payment'] as string | undefined;
      if (paymentProof) {
        // TODO: verify payment proof on-chain via Helius
        // For now, accept any non-empty proof as valid (production: validate)
        logger.info({ path: req.path, proof: paymentProof.slice(0, 20) + '...' }, '[HFSP_X402_003] Payment proof received');
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
          // Extract booking amount from request (flights, hotels, etc.)
          const bookingValue = parseFloat(req.body?.amount_usd || req.body?.booking_amount || '0');
          feeCalc = calculateFlightFee(bookingValue, config.solPrice);
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
        wallet: feeCalc.clawdrop_wallet,
      }, '[HFSP_X402_002] Transaction fee calculated');

      // Check if payment is required
      if (config.requirePayment) {
        // Return 402 with payment instructions
        return respond402(req, res, 'Payment required to complete transaction');
      }

      // Payment not required, continue
      next();
    } catch (error) {
      logger.error({ error }, '[HFSP_X402_ERROR] x402 middleware error');
      next(error);
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
  res.setHeader('X-Fee-Type', req.clawdrop.transaction_type || 'transfer');
  res.setHeader('X-Fee-Amount-SOL', (req.clawdrop.fee_sol || 0).toString());
  res.setHeader('X-Fee-Amount-USD', (req.clawdrop.fee_usd || 0).toFixed(2));
  res.setHeader('X-Fee-Percent', req.clawdrop.fee_type || 'flat');
  res.setHeader('X-Clawdrop-Wallet', req.clawdrop.clawdrop_wallet || '');
  res.setHeader('X-Transaction-Type', req.clawdrop.transaction_type || 'transfer');
  res.setHeader('X-Transaction-Confidence', (req.clawdrop.transaction_confidence || 0).toString());
}

/**
 * Respond with 402 Payment Required
 */
export function respond402(req: Request, res: Response, message?: string): void {
  if (!req.clawdrop) {
    res.status(402).json({ error: message || 'Payment required' });
    return;
  }

  const feeSol = req.clawdrop.fee_sol || 0;
  const paymentReqs = buildPaymentRequirements(feeSol);
  const paymentReqsB64 = Buffer.from(JSON.stringify(paymentReqs)).toString('base64');

  // Spec-compliant headers
  res.setHeader('WWW-Authenticate', 'x402');
  res.setHeader('X-Payment-Response', paymentReqsB64);
  res.setHeader('Accept-Payment', 'x402');

  // Legacy headers for backwards compatibility
  attachX402Headers(req, res);

  const response = {
    status: 'payment_required',
    error: message || 'Payment required to complete transaction',
    fee: {
      type: req.clawdrop.transaction_type || 'transfer',
      amount_sol: feeSol,
      amount_usd: req.clawdrop.fee_usd || 0,
      percent: req.clawdrop.fee_type || 'flat',
      clawdrop_wallet: req.clawdrop.clawdrop_wallet || '',
    },
    transaction: {
      type: req.clawdrop.transaction_type || 'transfer',
      confidence: req.clawdrop.transaction_confidence || 0,
    },
    payment_instructions: {
      send_to: req.clawdrop.clawdrop_wallet || '',
      amount: feeSol,
      memo: `[HFSP_${(req.clawdrop.transaction_type || 'transfer').toUpperCase()}_FEE]`,
    },
    // x402 spec-compliant payment requirements (also in header)
    x402: paymentReqs,
  };

  res.status(402).json(response);
}

export default x402Middleware;
