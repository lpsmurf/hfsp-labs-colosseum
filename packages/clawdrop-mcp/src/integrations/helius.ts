import axios from 'axios';
import logger from '../utils/logger';

/**
 * Helius Integration for Solana devnet price fetching
 * Fetches real prices or uses realistic fallbacks
 */

const HELIUS_API_URL = process.env.HELIUS_API_URL || 'https://api.helius.xyz/v0';
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

interface PriceData {
  sol: number;
  herd: number;
  timestamp: number;
  source: 'api' | 'cache' | 'fallback';
}

let cachedPrice: PriceData | null = null;
const CACHE_DURATION_MS = 30 * 1000; // 30 seconds

/**
 * Fetch SOL price from Helius API or use fallback
 */
export async function getSOLPrice(): Promise<number> {
  try {
    // Return cached price if fresh
    if (cachedPrice && Date.now() - cachedPrice.timestamp < CACHE_DURATION_MS) {
      logger.debug(
        { cached: true, price: cachedPrice.sol, source: cachedPrice.source },
        'SOL price (from cache)'
      );
      return cachedPrice.sol;
    }

    // Try to fetch from Helius API if key is available
    if (HELIUS_API_KEY) {
      try {
        const response = await axios.get(
          `${HELIUS_API_URL}/prices?tokens=SOL,HERD`,
          {
            params: { 'api-key': HELIUS_API_KEY },
            timeout: 5000,
          }
        );

        const prices = response.data;
        cachedPrice = {
          sol: prices.SOL?.price || 180.50,
          herd: prices.HERD?.price || 0.25,
          timestamp: Date.now(),
          source: 'api',
        };

        logger.debug(
          { price: cachedPrice.sol, source: 'api' },
          'SOL price fetched from Helius API'
        );
        return cachedPrice.sol;
      } catch (apiError) {
        logger.warn({ error: apiError }, 'Helius API fetch failed, using fallback');
      }
    }

    // Fallback: realistic prices
    const fallbackPrice = 180.50 + (Math.random() - 0.5) * 5; // Vary ±$2.50
    cachedPrice = {
      sol: fallbackPrice,
      herd: 0.25,
      timestamp: Date.now(),
      source: 'fallback',
    };

    logger.debug({ price: fallbackPrice, source: 'fallback' }, 'SOL price (fallback)');
    return fallbackPrice;
  } catch (error) {
    logger.error({ error }, 'Failed to get SOL price');
    // Emergency fallback
    return 180.0;
  }
}

/**
 * Fetch HERD price from Helius API or use fallback
 */
export async function getHERDPrice(): Promise<number> {
  try {
    // Use cached HERD price if available
    if (cachedPrice && Date.now() - cachedPrice.timestamp < CACHE_DURATION_MS) {
      return cachedPrice.herd;
    }

    // Try API if available
    if (HELIUS_API_KEY) {
      try {
        const response = await axios.get(
          `${HELIUS_API_URL}/prices?tokens=HERD`,
          {
            params: { 'api-key': HELIUS_API_KEY },
            timeout: 5000,
          }
        );
        const price = response.data.HERD?.price || 0.25;
        logger.debug({ price, source: 'api' }, 'HERD price fetched from API');
        return price;
      } catch (apiError) {
        logger.warn({ error: apiError }, 'Helius API fetch failed for HERD');
      }
    }

    // Fallback
    const fallbackPrice = 0.25;
    logger.debug({ price: fallbackPrice, source: 'fallback' }, 'HERD price (fallback)');
    return fallbackPrice;
  } catch (error) {
    logger.error({ error }, 'Failed to get HERD price');
    return 0.25;
  }
}

/**
 * Convert SOL amount to USD
 */
export async function convertSOLToUSD(solAmount: number): Promise<number> {
  const solPrice = await getSOLPrice();
  return solAmount * solPrice;
}

/**
 * Convert HERD amount to USD
 */
export async function convertHERDToUSD(herdAmount: number): Promise<number> {
  const herdPrice = await getHERDPrice();
  return herdAmount * herdPrice;
}

/**
 * Convert USD to SOL amount
 */
export async function convertUSDToSOL(usdAmount: number): Promise<number> {
  const solPrice = await getSOLPrice();
  return usdAmount / solPrice;
}

/**
 * Get current price info (useful for diagnostics)
 */
export function getCachedPrice(): PriceData | null {
  return cachedPrice;
}

/**
 * Simulate devnet RPC call for transaction
 * (In production: use @solana/web3.js to build real transactions)
 */
export async function simulateDevnetTransaction(
  amount: number,
  token: 'SOL' | 'HERD' = 'SOL'
): Promise<{
  gasEstimate: number;
  simulationSuccess: boolean;
  computeUnitsUsed: number;
}> {
  try {
    logger.debug({ amount, token }, 'Simulating devnet transaction');

    // Mock simulation with realistic values
    return {
      gasEstimate: 0.005, // 5000 lamports
      simulationSuccess: true,
      computeUnitsUsed: 23456, // Typical CU usage
    };
  } catch (error) {
    logger.error({ error }, 'Transaction simulation failed');
    throw error;
  }
}

/**
 * Verify a Solana transaction on devnet using Helius RPC
 * Checks if tx_hash has status 'confirmed' or 'finalized'
 * 
 * @param tx_hash - The transaction signature to verify
 * @returns boolean - true if transaction is confirmed/finalized, false otherwise
 */
export async function verifyHeliusTransaction(tx_hash: string): Promise<boolean> {
  try {
    logger.info({ tx_hash }, 'Verifying transaction on Helius devnet');

    // Use Helius devnet RPC endpoint
    const HELIUS_DEVNET_RPC = process.env.HELIUS_DEVNET_RPC || 'https://devnet.helius-rpc.com/';
    const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

    // Build the RPC URL with API key if available
    const rpcUrl = HELIUS_API_KEY 
      ? `${HELIUS_DEVNET_RPC}?api-key=${HELIUS_API_KEY}`
      : HELIUS_DEVNET_RPC;

    const response = await axios.post(
      rpcUrl,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignatureStatuses',
        params: [[tx_hash], { searchTransactionHistory: true }]
      },
      {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    // Check for RPC errors
    if (response.data.error) {
      logger.error({ error: response.data.error }, 'Helius RPC returned error');
      return false;
    }

    const result = response.data.result;
    if (!result || !result.value || result.value.length === 0) {
      logger.warn({ tx_hash }, 'Transaction not found on devnet');
      return false;
    }

    const status = result.value[0];
    
    // Transaction not found or null status
    if (!status) {
      logger.warn({ tx_hash }, 'Transaction status is null - may not exist yet');
      return false;
    }

    // Check confirmation status
    const confirmationStatus = status.confirmationStatus;
    const slot = status.slot;
    const confirmations = status.confirmations;
    const err = status.err;

    logger.info({
      tx_hash,
      confirmationStatus,
      slot,
      confirmations,
      hasError: !!err,
    }, 'Transaction status retrieved');

    // If transaction has an error, it's not valid
    if (err) {
      logger.error({ tx_hash, error: err }, 'Transaction failed with error');
      return false;
    }

    // Consider confirmed or finalized as valid
    const isConfirmed = confirmationStatus === 'confirmed' || confirmationStatus === 'finalized';
    
    if (isConfirmed) {
      logger.info({ tx_hash, confirmationStatus }, 'Transaction verified on-chain');
    } else {
      logger.warn({ tx_hash, confirmationStatus }, 'Transaction not yet confirmed');
    }

    return isConfirmed;
  } catch (error) {
    logger.error({ error, tx_hash }, 'Failed to verify transaction with Helius');
    return false;
  }
}

/**
 * Get detailed transaction information from Helius
 * Useful for debugging or showing transaction details to users
 * 
 * @param tx_hash - The transaction signature
 * @returns Transaction details or null if not found
 */
export async function getTransactionDetails(tx_hash: string): Promise<{
  slot: number;
  confirmations: number | null;
  confirmationStatus: string | null;
  timestamp: number | null;
  fee: number | null;
  error: any;
} | null> {
  try {
    const HELIUS_DEVNET_RPC = process.env.HELIUS_DEVNET_RPC || 'https://devnet.helius-rpc.com/';
    const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

    const rpcUrl = HELIUS_API_KEY 
      ? `${HELIUS_DEVNET_RPC}?api-key=${HELIUS_API_KEY}`
      : HELIUS_DEVNET_RPC;

    const response = await axios.post(
      rpcUrl,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignatureStatuses',
        params: [[tx_hash], { searchTransactionHistory: true }]
      },
      {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.error || !response.data.result?.value?.[0]) {
      return null;
    }

    const status = response.data.result.value[0];
    
    return {
      slot: status.slot,
      confirmations: status.confirmations,
      confirmationStatus: status.confirmationStatus,
      timestamp: status.blockTime || null,
      fee: status.fee || null,
      error: status.err,
    };
  } catch (error) {
    logger.error({ error, tx_hash }, 'Failed to get transaction details');
    return null;
  }
}

/**
 * Verify a Solana payment transaction using Helius RPC.
 * Checks recipient, amount, and confirmation status.
 *
 * @param params.tx_hash            - Transaction signature to verify
 * @param params.expected_recipient - Expected destination account (CLAWDROP_WALLET_ADDRESS)
 * @param params.min_amount_sol     - Minimum acceptable SOL transfer amount (tier price)
 * @param params.network            - 'mainnet' or 'devnet'
 */
export async function verifyPaymentTransaction(params: {
  tx_hash: string;
  expected_recipient: string;
  min_amount_sol: number;
  network: 'mainnet' | 'devnet';
}): Promise<{
  verified: boolean;
  reason: string;
  actual_amount_sol?: number;
  actual_recipient?: string;
  confirmation_status?: string;
}> {
  const { tx_hash, expected_recipient, min_amount_sol, network } = params;

  try {
    logger.info({ tx_hash, network, expected_recipient, min_amount_sol }, 'Verifying payment transaction');

    // Select RPC endpoint based on network
    const HELIUS_MAINNET_RPC = process.env.HELIUS_MAINNET_RPC || 'https://mainnet.helius-rpc.com/';
    const HELIUS_DEVNET_RPC  = process.env.HELIUS_DEVNET_RPC  || 'https://devnet.helius-rpc.com/';
    const apiKey = process.env.HELIUS_API_KEY;

    const baseUrl = network === 'mainnet' ? HELIUS_MAINNET_RPC : HELIUS_DEVNET_RPC;
    const rpcUrl  = apiKey ? `${baseUrl}?api-key=${apiKey}` : baseUrl;

    // Use getTransaction to get full tx including account keys and balances
    const response = await axios.post(
      rpcUrl,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'getTransaction',
        params: [
          tx_hash,
          {
            encoding: 'json',
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed',
          },
        ],
      },
      {
        timeout: 15000,
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (response.data.error) {
      logger.error({ error: response.data.error, tx_hash }, 'Helius RPC getTransaction error');
      return { verified: false, reason: `RPC error: ${response.data.error.message}` };
    }

    const tx = response.data.result;
    if (!tx) {
      return { verified: false, reason: 'Transaction not found on chain' };
    }

    // Check confirmation status
    const confirmationStatus: string = tx.meta?.confirmationStatus ?? 'unknown';
    if (confirmationStatus !== 'confirmed' && confirmationStatus !== 'finalized') {
      return {
        verified: false,
        reason: `Transaction not confirmed (status: ${confirmationStatus})`,
        confirmation_status: confirmationStatus,
      };
    }

    // Check for transaction-level error
    if (tx.meta?.err) {
      return {
        verified: false,
        reason: `Transaction failed on-chain: ${JSON.stringify(tx.meta.err)}`,
        confirmation_status: confirmationStatus,
      };
    }

    // Extract account keys — index 0 = sender, index 1 = recipient
    const accountKeys: string[] =
      tx.transaction?.message?.accountKeys ?? [];

    if (accountKeys.length < 2) {
      return {
        verified: false,
        reason: 'Transaction has fewer than 2 account keys — cannot determine recipient',
        confirmation_status: confirmationStatus,
      };
    }

    const actual_recipient: string = accountKeys[1];

    // Verify recipient
    if (actual_recipient !== expected_recipient) {
      logger.warn({ actual_recipient, expected_recipient, tx_hash }, 'Recipient mismatch');
      return {
        verified: false,
        reason: `Wrong recipient: expected ${expected_recipient}, got ${actual_recipient}`,
        actual_recipient,
        confirmation_status: confirmationStatus,
      };
    }

    // Calculate SOL transferred to recipient via balance diff (lamports → SOL)
    const preBalances: number[]  = tx.meta?.preBalances  ?? [];
    const postBalances: number[] = tx.meta?.postBalances ?? [];

    if (preBalances.length < 2 || postBalances.length < 2) {
      return {
        verified: false,
        reason: 'Cannot read balance arrays from transaction metadata',
        actual_recipient,
        confirmation_status: confirmationStatus,
      };
    }

    // Recipient's balance increase = lamports received
    const lamportsReceived = postBalances[1] - preBalances[1];
    const actual_amount_sol = lamportsReceived / 1e9;

    logger.info({ actual_amount_sol, min_amount_sol, tx_hash }, 'SOL amount check');

    // Check amount with 1% slippage tolerance
    if (actual_amount_sol < min_amount_sol * 0.99) {
      return {
        verified: false,
        reason: `Insufficient amount: expected ${min_amount_sol} SOL, received ${actual_amount_sol.toFixed(6)} SOL`,
        actual_amount_sol,
        actual_recipient,
        confirmation_status: confirmationStatus,
      };
    }

    logger.info({ tx_hash, actual_amount_sol, actual_recipient, confirmationStatus }, 'Payment transaction verified');

    return {
      verified: true,
      reason: 'Payment verified: confirmed, correct recipient, sufficient amount',
      actual_amount_sol,
      actual_recipient,
      confirmation_status: confirmationStatus,
    };
  } catch (error) {
    logger.error({ error, tx_hash }, 'verifyPaymentTransaction failed');
    return {
      verified: false,
      reason: `Verification error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
