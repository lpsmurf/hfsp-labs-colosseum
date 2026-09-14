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
import { verifyPaymentTransaction } from '../integrations/helius';
import { createResourceServer, createPrepaidGate, gate, DEFAULT_FACILITATOR } from '@hfsp/x402-common';

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

const NETWORK: 'mainnet' | 'devnet' =
  process.env.SOLANA_NETWORK === 'devnet' ? 'devnet' : 'mainnet';

const settle = createPrepaidGate(createResourceServer({
  facilitatorUrl: process.env.FACILITATOR_URL ?? DEFAULT_FACILITATOR,
  families: ['svm'], networks: [NETWORK === 'devnet' ? 'solanaDevnet' : 'solana'],
}));

// A confirmed transaction stays valid on-chain forever, so without an age limit
// one payment receipt would unlock the endpoint indefinitely.
const MAX_PAYMENT_AGE_SECS = 300;

// Replay protection. In-memory, so it does NOT hold across a restart or a second
// replica — matches the other Clawdrop services for now. Move to Redis (SET NX,
// as x402-vpn-vps does) before running this behind more than one process.
const usedSignatures = new Map<string, NodeJS.Timeout>();

function claimSignature(signature: string): boolean {
  if (usedSignatures.has(signature)) return false;
  const timer = setTimeout(() => usedSignatures.delete(signature), MAX_PAYMENT_AGE_SECS * 3 * 1000);
  timer.unref?.();
  usedSignatures.set(signature, timer);
  return true;
}

/** Undo a claim for a proof that turned out not to be spendable. */
function releaseSignature(signature: string): void {
  const timer = usedSignatures.get(signature);
  if (timer) clearTimeout(timer);
  usedSignatures.delete(signature);
}

/** Test seam — lets the suite start from a clean replay cache. */
export function __resetReplayCache(): void {
  for (const timer of usedSignatures.values()) clearTimeout(timer);
  usedSignatures.clear();
}

// CAIP-2 id for Solana mainnet — the first 32 chars of the genesis hash.
// V1 spelled this "solana-mainnet", which no V2 facilitator or client accepts.
const SOLANA_MAINNET = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const SOLANA_DEVNET  = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';

interface PaymentRequirements {
  x402Version: 2;
  resource: { url: string; description: string; mimeType: string };
  accepts: Array<{
    scheme: string;
    network: string;
    asset: string;
    amount: string;
    payTo: string;
    maxTimeoutSeconds: number;
    extra: Record<string, unknown>;
  }>;
}

function buildPaymentRequirements(feeSol: number, resourceUrl: string, description: string): PaymentRequirements {
  // Native SOL, so amounts are in lamports (9 decimals) rather than USDC's 6.
  const lamports = Math.ceil(feeSol * 1e9).toString();
  return {
    x402Version: 2,
    resource: { url: resourceUrl, description, mimeType: 'application/json' },
    accepts: [
      {
        scheme: 'exact',
        network: NETWORK === 'devnet' ? SOLANA_DEVNET : SOLANA_MAINNET,
        asset: 'SOL',
        amount: lamports,
        payTo: PLATFORM_WALLET,
        maxTimeoutSeconds: 300,
        extra: { memo: 'clawdrop-api' },
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

      // Classify the transaction.
      //
      // This has to run BEFORE the payment check, not after: the fee depends on
      // the transaction type and size, so there is no "amount required" to verify
      // a proof against until classification has happened.
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

      // calculateFlightFee floors fee_sol at MIN_FEE_SOL but not the USD estimate,
      // and the V2 gate charges the USD figure — keep them consistent.
      feeCalc = {
        ...feeCalc,
        fee_usd_estimate: Math.max(feeCalc.fee_usd_estimate, FEE_RATES.MIN_FEE_SOL * (config.solPrice ?? 250)),
      };

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

      // Payment gate disabled (dev / internal callers) — fee metadata is still attached.
      if (!config.requirePayment) return next();

      if (!PLATFORM_WALLET) {
        return res.status(503).json({ error: 'Payment recipient is not configured' });
      }
      const v2 = req.get('payment-signature')?.trim();
      const paymentProof = !v2 ? req.get('x-payment')?.trim() : undefined;
      if (!paymentProof) {
        // Standard SVM exact payments use USDC. Native SOL remains legacy-only.
        // settle() writes the V2 PAYMENT-REQUIRED header and body; the legacy
        // X-Fee-* headers ride along so SOL clients still see the fee.
        attachX402Headers(req, res);
        const payment = await settle(req, res, gate({
          price: feeCalc.fee_usd_estimate, payTo: PLATFORM_WALLET,
          network: NETWORK === 'devnet' ? 'solanaDevnet' : 'solana',
          description: `Clawdrop ${classification.type} fee`,
        }));
        if (!payment) return;
        req.clawdrop.payment_verified = true;
        req.clawdrop.payment_signature = payment.transaction;
        return next();
      }

      // Claim the signature before hitting the RPC, so two concurrent requests
      // carrying the same proof can't both pass while verification is in flight.
      if (!claimSignature(paymentProof)) {
        logger.warn({ path: req.path, proof: paymentProof.slice(0, 20) + '...' }, '[HFSP_X402_006] Replayed payment proof rejected');
        return respond402(req, res, 'Payment proof already used');
      }

      const verification = await verifyPaymentTransaction({
        tx_hash:            paymentProof,
        expected_recipient: PLATFORM_WALLET,
        min_amount_sol:     feeCalc.fee_sol,
        network:            NETWORK,
      });

      if (!verification.verified) {
        // Release the claim — the proof was never spent, and a caller who hit a
        // transient RPC failure must be able to retry with the same signature.
        releaseSignature(paymentProof);
        logger.warn({ path: req.path, reason: verification.reason }, '[HFSP_X402_004] Payment verification failed');
        return respond402(req, res, `Payment verification failed: ${verification.reason}`);
      }

      const ageSecs = verification.block_time
        ? Date.now() / 1000 - verification.block_time
        : 0;
      if (ageSecs > MAX_PAYMENT_AGE_SECS) {
        releaseSignature(paymentProof);
        logger.warn({ path: req.path, ageSecs }, '[HFSP_X402_007] Stale payment proof rejected');
        return respond402(req, res, `Payment expired (${Math.round(ageSecs)}s old, max ${MAX_PAYMENT_AGE_SECS}s)`);
      }

      logger.info({
        path: req.path,
        paid_sol: verification.actual_amount_sol,
        required_sol: feeCalc.fee_sol,
      }, '[HFSP_X402_003] Payment verified on-chain');

      req.clawdrop.payment_verified = true;
      req.clawdrop.payment_signature = paymentProof;
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
 * Best-effort absolute URL for the requested resource.
 *
 * `respond402` is exported and gets called with partial Request objects (tests,
 * other middleware), so nothing here may assume a fully-formed Express request —
 * a missing `req.get` must not turn a 402 into a 500.
 */
function buildResourceUrl(req: Request): string {
  const host = typeof req.get === 'function' ? req.get('host') : undefined;
  const proto = req.protocol ?? 'https';
  const path = req.originalUrl ?? req.path ?? '';
  return `${proto}://${host ?? 'localhost'}${path}`;
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
  const resourceUrl = buildResourceUrl(req);
  const description = `Clawdrop ${req.clawdrop.transaction_type || 'transfer'} fee`;
  const paymentReqs = buildPaymentRequirements(feeSol, resourceUrl, description);
  const paymentReqsB64 = Buffer.from(JSON.stringify(paymentReqs)).toString('base64');

  // PAYMENT-REQUIRED is the V2 challenge header. This previously used
  // X-Payment-Response, which is the *settlement receipt* header — a client
  // reading it as a receipt would have seen a challenge and mis-parsed it.
  res.setHeader('PAYMENT-REQUIRED', paymentReqsB64);
  res.setHeader('WWW-Authenticate', 'x402');
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
