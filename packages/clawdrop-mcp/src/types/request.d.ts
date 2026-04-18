/**
 * Unified Clawdrop Request Extension
 * 
 * This file consolidates all clawdrop property definitions to avoid
 * TypeScript declaration conflicts across middleware.
 */

import { Request } from 'express';

export type TransactionType = 'swap' | 'flight' | 'transfer' | 'booking';
export type FeeType = 'swap' | 'transfer' | 'booking';

export interface ClawdropRequestContext {
  // From x402 middleware (transaction classification)
  transaction_type?: TransactionType;
  transaction_confidence?: number;
  fee_sol?: number;
  fee_usd?: number;
  fee_type?: string;
  clawdrop_wallet?: string;
  
  // From payment middleware (payment execution)
  feeType?: FeeType;
  feeAmount?: number;
  feeUsd?: number;
  quote?: any;
  transactionId?: string;
  metadata?: Record<string, any>;
}

declare global {
  namespace Express {
    interface Request {
      clawdrop?: ClawdropRequestContext;
    }
  }
}

// Export for use in other modules
export {};
