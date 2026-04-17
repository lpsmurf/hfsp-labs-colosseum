/**
 * Clawdrop Payment Service
 * Handles payment verification, swapping, and fee calculation
 */

import axios from "axios";
import { SUPPORTED_TOKENS, CLAWDROP_CONFIG } from "../config/tokens";
import { verifyHeliusTransaction } from "../integrations/helius";

interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  priceImpactPct: string;
  routePlan: any[];
}

interface PaymentQuote {
  tier_id: string;
  tier_price_sol: number;
  tier_price_usd: number;
  payment_token: string;
  amount_to_send: number;
  amount_to_send_formatted: string;
  swap_details?: {
    from_token: string;
    to_token: string;
    from_amount: number;
    to_amount: number;
    slippage_percent: number;
  };
  clawdrop_fee: number;
  clawdrop_receives: number;
  payment_address: string;
  expires_at: Date;
}

interface PaymentVerification {
  verified: boolean;
  payment_token: string;
  received_amount: number;
  swapped_to_sol: number;
  clawdrop_fee: number;
  clawdrop_receives: number;
  tier_id: string;
}

/**
 * Get current token prices from Jupiter
 */
export async function getTokenPrices(tokens: string[]): Promise<Record<string, number>> {
  try {
    // Get SOL price in USD
    const response = await axios.get(
      `${CLAWDROP_CONFIG.JUPITER_API_URL}/price`,
      {
        params: {
          ids: tokens.join(","),
        },
      }
    );

    // Convert to object: { SOL: 100, USDT: 1, USDC: 1, HERD: 0.1 }
    const prices: Record<string, number> = {};
    for (const token of tokens) {
      prices[token] = response.data.data?.[token]?.price || 1; // Default to 1 if not found
    }

    return prices;
  } catch (error) {
    console.error("Error fetching token prices:", error);
    // Fallback to hardcoded prices for MVP
    return {
      SOL: 200, // $200 per SOL (adjust as needed)
      USDT: 1,
      USDC: 1,
      HERD: 0.1, // $0.10 per HERD (adjust as needed)
    };
  }
}

/**
 * Get swap quote from Jupiter
 */
export async function getSwapQuote(
  fromToken: string,
  toToken: string,
  amount: number
): Promise<JupiterQuote | null> {
  try {
    if (fromToken === toToken) {
      return null; // No swap needed
    }

    const fromMint = SUPPORTED_TOKENS[fromToken as keyof typeof SUPPORTED_TOKENS]?.mint;
    const toMint = SUPPORTED_TOKENS[toToken as keyof typeof SUPPORTED_TOKENS]?.mint;

    if (!fromMint || !toMint) {
      throw new Error(`Unsupported token pair: ${fromToken} -> ${toToken}`);
    }

    const response = await axios.get(
      `${CLAWDROP_CONFIG.JUPITER_API_URL}/quote`,
      {
        params: {
          inputMint: fromMint,
          outputMint: toMint,
          amount: Math.floor(amount * 10 ** 6), // Convert to smallest unit
          slippageBps: CLAWDROP_CONFIG.MAX_SLIPPAGE_BPS,
        },
      }
    );

    return response.data.data || response.data;
  } catch (error) {
    console.error(`Error getting swap quote for ${fromToken} -> ${toToken}:`, error);
    return null;
  }
}

/**
 * Calculate Clawdrop fee based on transaction size
 */
export function calculateFee(tierPriceUsd: number, swappedSol?: number): number {
  if (tierPriceUsd < CLAWDROP_CONFIG.FLAT_FEE_THRESHOLD_USD) {
    // Transaction < $100: Flat $1 fee
    const prices = {
      SOL: 200, // Placeholder, would be fetched in real code
    };
    return CLAWDROP_CONFIG.FLAT_FEE_USD / prices.SOL;
  } else {
    // Transaction >= $100: 0.35% of swapped amount
    return (swappedSol || 0) * CLAWDROP_CONFIG.JUPITER_FEE_PERCENT;
  }
}

/**
 * Get payment quote for deploying an agent
 */
export async function getPaymentQuote(
  tier_id: string,
  tierPriceSol: number,
  fromToken: string = "SOL"
): Promise<PaymentQuote> {
  // Get current prices
  const prices = await getTokenPrices(["SOL", fromToken]);
  const tierPriceUsd = tierPriceSol * prices.SOL;

  // If paying with SOL, direct payment
  if (fromToken === "SOL") {
    const fee = calculateFee(tierPriceUsd);
    return {
      tier_id,
      tier_price_sol: tierPriceSol,
      tier_price_usd: tierPriceUsd,
      payment_token: "SOL",
      amount_to_send: tierPriceSol,
      amount_to_send_formatted: `${tierPriceSol.toFixed(4)} SOL`,
      clawdrop_fee: fee,
      clawdrop_receives: tierPriceSol - fee,
      payment_address: CLAWDROP_CONFIG.WALLET_ADDRESS,
      expires_at: new Date(Date.now() + CLAWDROP_CONFIG.PAYMENT_QUOTE_EXPIRY_SECONDS * 1000),
    };
  }

  // Get swap quote from Jupiter
  const swapQuote = await getSwapQuote(fromToken, "SOL", tierPriceSol);

  if (!swapQuote) {
    throw new Error(`Cannot get swap quote for ${fromToken} -> SOL`);
  }

  const amountToSend = Number(swapQuote.inAmount) / 10 ** 6; // Convert from smallest unit
  const swappedSol = Number(swapQuote.outAmount) / 10 ** 9; // Convert from lamports

  const fee = calculateFee(tierPriceUsd, swappedSol);

  return {
    tier_id,
    tier_price_sol: tierPriceSol,
    tier_price_usd: tierPriceUsd,
    payment_token: fromToken,
    amount_to_send: amountToSend,
    amount_to_send_formatted: `${amountToSend.toFixed(2)} ${fromToken}`,
    swap_details: {
      from_token: fromToken,
      to_token: "SOL",
      from_amount: amountToSend,
      to_amount: swappedSol,
      slippage_percent: 5,
    },
    clawdrop_fee: fee,
    clawdrop_receives: swappedSol - fee,
    payment_address: CLAWDROP_CONFIG.WALLET_ADDRESS,
    expires_at: new Date(Date.now() + CLAWDROP_CONFIG.PAYMENT_QUOTE_EXPIRY_SECONDS * 1000),
  };
}

/**
 * Verify payment on-chain via Helius devnet RPC.
 * Confirms the tx is finalized and sent to the Clawdrop wallet.
 */
export async function verifyPayment(tx_hash: string): Promise<boolean> {
  // Allow test bypass ONLY in non-production environments
  if (process.env.NODE_ENV !== 'production') {
    if (tx_hash.startsWith("devnet_") || tx_hash.startsWith("test_")) {
      console.log(`[DEV] Skipping on-chain verification for test tx: ${tx_hash}`);
      return true;
    }
  }
  return verifyHeliusTransaction(tx_hash);
}

/**
 * Execute swap on Jupiter and verify completion
 */
export async function executeSwap(
  fromToken: string,
  toToken: string,
  amount: number,
  userPublicKey: string
): Promise<{ outputAmount: number; txSignature: string }> {
  try {
    // TODO: Implement Jupiter swap execution
    console.log(
      `[TODO] Execute swap: ${amount} ${fromToken} -> ${toToken} for ${userPublicKey}`
    );
    return { outputAmount: amount * 1.0, txSignature: "TODO" }; // Placeholder
  } catch (error) {
    console.error("Error executing swap:", error);
    throw error;
  }
}
