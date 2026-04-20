/**
 * Clawdrop Payment Middleware
 * 
 * Orchestrates the complete payment flow:
 * 1. x402 classifies transaction type
 * 2. Payment service generates quotes
 * 3. Fee collector calculates fees
 * 4. MemPalace records transaction
 * 5. Solana payment executes transfer
 * 
 * Custom Error Signatures: [PAYMENT_*]
 */

import { Request, Response, NextFunction } from 'express';
import { 
  getPaymentQuote, 
  verifyPayment, 
  getTokenPrices,
  getSwapQuote 
} from '../services/payment';
import { 
  calculateSwapFee, 
  calculateTransferFee, 
  calculateBookingFee,
  collectFee,
  FeeType 
} from '../services/fee-collector';
import { 
  beforeTransactionHook,
  afterTransactionSuccessHook,
  onTransactionErrorHook,
  attachTransactionMetadataHook
} from '../services/transaction-hooks';
import { MemPalaceClient } from '../integrations/mempalace';
import { sendDevnetPayment, getBalance } from '../integrations/solana-payment';
import { logger } from '../utils/logger';

// Use FeeType from fee-collector
export { FeeType };

interface PaymentRequest {
  wallet_address: string;
  tier_id?: string;
  from_token?: string;
  to_token?: string;
  amount_usd?: number;
  amount_sol?: number;
  destination?: string;
  metadata?: Record<string, any>;
}

/**
 * Validate payment request has required fields
 */
export function validatePaymentRequest(req: Request, res: Response, next: NextFunction): void {
  const { wallet_address, ...data } = req.body as PaymentRequest;

  if (!wallet_address || !wallet_address.match(/^[1-9A-HJ-NP-Z]{32,34}$/)) {
    logger.warn({ wallet: wallet_address }, '[PAYMENT_INVALID_WALLET] Invalid Solana wallet address');
    res.status(400).json({
      error: '[PAYMENT_INVALID_WALLET] Invalid wallet address',
      details: 'Must be a valid Solana public key (32-34 base58 chars)',
    });
    return;
  }

  req.clawdrop = { metadata: data };
  next();
}

/**
 * Generate payment quote based on transaction type
 */
export async function generatePaymentQuote(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { wallet_address, tier_id, from_token = 'SOL', amount_sol } = req.body as PaymentRequest;

    // Determine fee type based on request
    let feeType: FeeType = 'transfer';
    
    if (tier_id) {
      feeType = 'swap';
    } else if (req.body.flight_booking_value || req.body.hotel_booking_value) {
      feeType = 'flight';
    }

    // Get token prices
    const prices = await getTokenPrices(['SOL', from_token]);
    const solPrice = prices.SOL;

    let quote: any;
    let feeCalc: any;

    // Route to appropriate handler
    if (feeType === 'swap' && tier_id && amount_sol) {
      // Swap quote: purchase tier with SOL
      quote = await getPaymentQuote(tier_id, amount_sol, from_token);
      feeCalc = calculateSwapFee(amount_sol, solPrice);
      
    } else if (feeType === 'flight' && req.body.booking_value_usd) {
      // Booking quote
      feeCalc = calculateBookingFee(req.body.booking_value_usd, solPrice);
      quote = {
        tier_id: 'booking',
        payment_token: from_token,
        amount_to_send: req.body.booking_value_usd / prices[from_token],
        clawdrop_fee: feeCalc.fee_sol,
        clawdrop_receives: (req.body.booking_value_usd / prices[from_token]) - feeCalc.fee_sol,
        expires_at: new Date(Date.now() + 30 * 60 * 1000), // 30 min expiry
      };
      
    } else {
      // Default transfer quote
      feeCalc = calculateTransferFee(solPrice);
      quote = {
        tier_id: 'transfer',
        payment_token: from_token,
        amount_to_send: 0,
        clawdrop_fee: feeCalc.fee_sol,
        clawdrop_receives: 0,
        expires_at: new Date(Date.now() + 30 * 60 * 1000),
      };
    }

    // Attach to request context
    if (!req.clawdrop) req.clawdrop = {};
    req.clawdrop.quote = quote;
    req.clawdrop.feeType = feeType;
    req.clawdrop.feeAmount = feeCalc.fee_sol;
    req.clawdrop.feeUsd = feeCalc.fee_usd_estimate;

    logger.info(
      {
        wallet: wallet_address,
        type: feeType,
        fee_sol: feeCalc.fee_sol,
        fee_usd: feeCalc.fee_usd_estimate,
      },
      '[PAYMENT_QUOTE_GENERATED] Payment quote generated'
    );

    next();
  } catch (error) {
    logger.error({ error }, '[PAYMENT_QUOTE_ERROR] Failed to generate quote');
    res.status(500).json({
      error: '[PAYMENT_QUOTE_ERROR] Failed to generate payment quote',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Record transaction in MemPalace before executing payment
 */
export async function recordTransactionStart(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { wallet_address } = req.body as PaymentRequest;
    
    // Call before transaction hook (generates transaction ID)
    await beforeTransactionHook(req, {
      transaction_type: req.clawdrop?.feeType || 'transfer',
      wallet_address: wallet_address,
      fee_sol: req.clawdrop?.feeAmount || 0,
      fee_usd: req.clawdrop?.feeUsd || 0,
      status: 'pending',
      transaction_id: req.headers['x-transaction-id'] as string || 'unknown',
      confidence: 0.8,
    });

    // Attach transaction metadata
    await attachTransactionMetadataHook(req, res, {
      transaction_id: req.headers['x-transaction-id'] as string || 'unknown',
      transaction_type: req.clawdrop?.feeType || 'transfer',
      status: 'pending',
      fee_sol: req.clawdrop?.feeAmount || 0,
      fee_usd: req.clawdrop?.feeUsd || 0,
      wallet_address: wallet_address,
      confidence: 0.8,
    });

    // Store in request context
    if (!req.clawdrop) req.clawdrop = {};
    req.clawdrop.transactionId = req.headers['x-transaction-id'] as string;

    logger.info(
      { tx_id: req.clawdrop.transactionId, wallet: wallet_address },
      '[PAYMENT_TRANSACTION_STARTED] Transaction recorded'
    );

    next();
  } catch (error) {
    logger.warn({ error }, '[PAYMENT_RECORD_ERROR] Failed to record transaction start');
    // Don't block transaction if MemPalace fails
    next();
  }
}

/**
 * Execute payment transaction on Solana
 */
export async function executePayment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { wallet_address, destination, amount_sol = 0 } = req.body as PaymentRequest;
    const feeAmount = req.clawdrop?.feeAmount || 0;

    // In production, use actual wallet from signing request
    // For now, use devnet wallet simulation
    if (amount_sol > 0 && destination) {
      // Execute actual payment
      const result = await sendDevnetPayment(destination, amount_sol);
      
      if (!result.success) {
        throw new Error(result.error || 'Payment failed');
      }

      if (!req.clawdrop) req.clawdrop = {};
      req.clawdrop.metadata = {
        ...req.clawdrop.metadata,
        tx_signature: result.signature,
        payment_executed: true,
      };

      logger.info(
        { wallet: wallet_address, signature: result.signature, amount: amount_sol },
        '[PAYMENT_EXECUTED] Payment transaction sent'
      );
    }

    // Verify payment if signature provided
    if (req.clawdrop?.metadata?.tx_signature) {
      const verified = await verifyPayment(req.clawdrop.metadata.tx_signature);
      if (!verified) {
        throw new Error('Payment verification failed');
      }
      req.clawdrop.metadata.verified = true;
    }

    // Collect fees on-chain
    if (feeAmount > 0) {
      try {
        const feeEvent = await collectFee({
          type: req.clawdrop?.feeType || 'transfer',
          user_wallet: wallet_address,
          fee_sol: feeAmount,
          fee_usd_estimate: req.clawdrop?.feeUsd || 0,
          metadata: req.clawdrop?.metadata,
        });

        if (!req.clawdrop) req.clawdrop = {};
        req.clawdrop.metadata = {
          ...req.clawdrop.metadata,
          fee_collected: true,
          fee_tx: feeEvent.tx_signature,
        };

        logger.info(
          { fee_sol: feeAmount, fee_usd: req.clawdrop.feeUsd },
          '[FEE_COLLECTED] Fee collected on-chain'
        );
      } catch (feeError) {
        logger.warn({ error: feeError }, '[FEE_COLLECTION_ERROR] Fee collection failed');
        // Don't block if fee collection fails
      }
    }

    next();
  } catch (error) {
    logger.error({ error }, '[PAYMENT_EXECUTION_ERROR] Payment execution failed');
    
    // Record error in transaction hooks
    try {
      await onTransactionErrorHook(
        req.clawdrop?.feeType || 'transfer',
        error instanceof Error ? error : new Error(String(error))
      );
    } catch (hookError) {
      logger.warn({ error: hookError }, '[PAYMENT_HOOK_ERROR] Error hook failed');
    }

    res.status(402).json({
      error: '[PAYMENT_EXECUTION_ERROR] Payment failed',
      details: error instanceof Error ? error.message : String(error),
      tx_id: req.clawdrop?.transactionId,
    });
  }
}

/**
 * Record successful transaction completion in MemPalace
 */
export async function recordTransactionSuccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Call after success hook
    await afterTransactionSuccessHook(
      req.clawdrop?.feeType || 'transfer',
      req.clawdrop?.metadata
    );

    logger.info(
      { tx_id: req.clawdrop?.transactionId },
      '[PAYMENT_RECORDED] Transaction recorded successfully'
    );

    next();
  } catch (error) {
    logger.warn({ error }, '[PAYMENT_RECORD_SUCCESS_ERROR] Failed to record success');
    // Don't block response if MemPalace fails
    next();
  }
}

export default {
  validatePaymentRequest,
  generatePaymentQuote,
  recordTransactionStart,
  executePayment,
  recordTransactionSuccess,
};
