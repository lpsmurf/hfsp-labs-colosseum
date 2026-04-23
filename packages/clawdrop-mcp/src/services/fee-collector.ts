/**
 * Clawdrop Fee Collector
 * 
 * Collects platform fees on every transaction:
 * - Swaps: 0.35% of swap value
 * - Transfers: flat $0.05 (in SOL equivalent)
 * - Bookings (flights/hotels): 0.5% of booking value
 * 
 * Fees are sent to CLAWDROP_FEE_WALLET env var.
 * All fee events are logged for accounting.
 */

import { Connection, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction, Keypair } from '@solana/web3.js';
import logger from '../utils/logger';

// Fee rates
export const FEE_RATES = {
  SWAP_PERCENT: 0.0035,          // 0.35%
  TRANSFER_FLAT_SOL: 0.0002,     // ~$0.05 at $250/SOL
  BOOKING_PERCENT: 0.005,        // 0.5%
  MIN_FEE_SOL: 0.00005,          // minimum fee (dust protection)
} as const;

export type FeeType = 'swap' | 'transfer' | 'flight';

export interface FeeEvent {
  type: FeeType;
  user_wallet: string;
  amount_sol: number;
  fee_sol: number;
  fee_usd_estimate: number;
  tx_signature?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface FeeCalculation {
  fee_sol: number;
  fee_usd_estimate: number;
  fee_percent: string;
  clawdrop_wallet: string;
}

// In-memory fee log (replace with DB in production)
const feeLog: FeeEvent[] = [];

function getFeeWallet(): string {
  const wallet = process.env.CLAWDROP_FEE_WALLET || process.env.CLAWDROP_WALLET_ADDRESS || '';
  if (!wallet) {
    logger.warn('CLAWDROP_FEE_WALLET not set — fees will be logged but not collected');
  }
  return wallet;
}

/**
 * Calculate fee for a swap transaction
 */
export function calculateSwapFee(amountSol: number, solPriceUsd = 250): FeeCalculation {
  const fee_sol = Math.max(amountSol * FEE_RATES.SWAP_PERCENT, FEE_RATES.MIN_FEE_SOL);
  return {
    fee_sol,
    fee_usd_estimate: fee_sol * solPriceUsd,
    fee_percent: '0.35%',
    clawdrop_wallet: getFeeWallet(),
  };
}

/**
 * Calculate fee for a token transfer
 */
export function calculateTransferFee(solPriceUsd = 250): FeeCalculation {
  return {
    fee_sol: FEE_RATES.TRANSFER_FLAT_SOL,
    fee_usd_estimate: FEE_RATES.TRANSFER_FLAT_SOL * solPriceUsd,
    fee_percent: 'flat',
    clawdrop_wallet: getFeeWallet(),
  };
}

/**
 * Calculate fee for a flight/booking transaction
 */
export function calculateFlightFee(bookingValueUsd: number, solPriceUsd = 250): FeeCalculation {
  const fee_usd = bookingValueUsd * FEE_RATES.BOOKING_PERCENT;
  const fee_sol = fee_usd / solPriceUsd;
  return {
    fee_sol: Math.max(fee_sol, FEE_RATES.MIN_FEE_SOL),
    fee_usd_estimate: fee_usd,
    fee_percent: '0.5%',
    clawdrop_wallet: getFeeWallet(),
  };
}

// Alias for backward compatibility
export const calculateBookingFee = calculateFlightFee;

/**
 * Collect fee on-chain by sending SOL to Clawdrop fee wallet
 * Called after every successful transaction
 */
export async function collectFee(params: {
  type: FeeType;
  user_wallet: string;
  fee_sol: number;
  fee_usd_estimate: number;
  metadata?: Record<string, unknown>;
  user_keypair?: Keypair; // Optional — if we have signing capability
}): Promise<FeeEvent> {
  const event: FeeEvent = {
    type: params.type,
    user_wallet: params.user_wallet,
    amount_sol: 0,
    fee_sol: params.fee_sol,
    fee_usd_estimate: params.fee_usd_estimate,
    metadata: params.metadata,
    timestamp: new Date().toISOString(),
  };

  const feeWallet = getFeeWallet();

  // If we have keypair and fee wallet, collect on-chain
  if (params.user_keypair && feeWallet && params.fee_sol > FEE_RATES.MIN_FEE_SOL) {
    try {
      const rpcUrl = process.env.HELIUS_MAINNET_RPC 
        || `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
        || 'https://api.mainnet-beta.solana.com';
      
      const connection = new Connection(rpcUrl, 'confirmed');
      const feeLamports = Math.floor(params.fee_sol * 1e9);

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: params.user_keypair.publicKey,
          toPubkey: new PublicKey(feeWallet),
          lamports: feeLamports,
        })
      );

      const signature = await sendAndConfirmTransaction(connection, tx, [params.user_keypair]);
      event.tx_signature = signature;

      logger.info({ 
        fee_sol: params.fee_sol, 
        fee_usd: params.fee_usd_estimate,
        type: params.type,
        signature 
      }, 'Fee collected on-chain');

    } catch (error) {
      // Fee collection failure should NOT block the main transaction
      logger.warn({ error, fee_sol: params.fee_sol }, 'Fee collection failed — logging only');
    }
  } else {
    // Log fee event for manual collection / future automation
    logger.info({
      fee_sol: params.fee_sol,
      fee_usd: params.fee_usd_estimate,
      type: params.type,
      user: params.user_wallet,
      note: 'Fee logged (no keypair for auto-collection)',
    }, 'Fee event recorded');
  }

  // Always log
  feeLog.push(event);
  return event;
}

/**
 * Get fee summary for accounting
 */
export function getFeeSummary(): {
  total_events: number;
  total_fee_sol: number;
  total_fee_usd_estimate: number;
  by_type: Record<FeeType, { count: number; sol: number }>;
  collected_on_chain: number;
  pending_collection: number;
} {
  const summary = {
    total_events: feeLog.length,
    total_fee_sol: 0,
    total_fee_usd_estimate: 0,
    by_type: {
      swap: { count: 0, sol: 0 },
      transfer: { count: 0, sol: 0 },
      flight: { count: 0, sol: 0 },
    } as Record<FeeType, { count: number; sol: number }>,
    collected_on_chain: 0,
    pending_collection: 0,
  };

  for (const event of feeLog) {
    summary.total_fee_sol += event.fee_sol;
    summary.total_fee_usd_estimate += event.fee_usd_estimate;
    summary.by_type[event.type].count++;
    summary.by_type[event.type].sol += event.fee_sol;
    if (event.tx_signature) {
      summary.collected_on_chain++;
    } else {
      summary.pending_collection++;
    }
  }

  return summary;
}
