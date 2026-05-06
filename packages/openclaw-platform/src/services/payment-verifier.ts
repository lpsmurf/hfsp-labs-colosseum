/**
 * Payment Verifier — Verify Solana transactions on-chain via @solana/pay
 *
 * Checks:
 * 1. Transaction is confirmed and valid
 * 2. Recipient matches PLATFORM_WALLET_ADDRESS
 * 3. Amount >= tier price (in token native units)
 * 4. tx_signature not already used (enforced by DB UNIQUE)
 *
 * Replaces hand-rolled Helius API calls with @solana/pay validateTransfer.
 */

import { validateTransfer } from '@solana/pay';
import { Connection, PublicKey } from '@solana/web3.js';
import BigNumber from 'bignumber.js';
import { db } from '../db/index.js';

export interface PaymentVerification {
  valid: boolean;
  token: string;
  amount: string;
  amountUsd: number;
  recipient: string;
  sender: string;
  error?: string;
}

const SUPPORTED_MINTS: Record<string, string> = {
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  SOL: 'native',
  HERD: process.env.HERD_MINT_ADDRESS ?? '',
};

const TIER_PRICES_USD: Record<string, number> = {
  starter: 19,
  pro: 59,
};

const TOKEN_DECIMALS: Record<string, number> = {
  USDC: 6,
  USDT: 6,
  SOL: 9,
  HERD: 6,
};

const SOLANA_RPC = process.env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com';

function getConnection(): Connection {
  return new Connection(SOLANA_RPC, 'confirmed');
}

function getPlatformWallet(): PublicKey {
  const addr = process.env.PLATFORM_WALLET_ADDRESS;
  if (!addr) throw new Error('PLATFORM_WALLET_ADDRESS not configured');
  return new PublicKey(addr);
}

/**
 * Check if tx_signature already used (double-spend protection)
 */
function isTxUsed(txSignature: string): boolean {
  const row = db()
    .prepare('SELECT 1 FROM payments WHERE tx_signature = ?')
    .get(txSignature) as { 1: number } | undefined;
  return row !== undefined;
}

/**
 * Convert USD amount to token native units (lamports / micro-units)
 */
function toNativeAmount(usdAmount: number, token: string, solPriceUsd: number): BigNumber {
  if (token === 'SOL') {
    const solAmount = usdAmount / solPriceUsd;
    return new BigNumber(solAmount).multipliedBy(10 ** TOKEN_DECIMALS.SOL);
  }
  // For USDC/USDT: 1 USD = 1 token unit
  return new BigNumber(usdAmount).multipliedBy(10 ** (TOKEN_DECIMALS[token] ?? 6));
}

/**
 * Verify a Solana payment transaction using @solana/pay
 */
export async function verifyPayment(
  txSignature: string,
  expectedTier: string,
): Promise<PaymentVerification> {
  try {
    // 1. Check double-spend
    if (isTxUsed(txSignature)) {
      return { valid: false, token: '', amount: '0', amountUsd: 0, recipient: '', sender: '', error: 'Transaction already used' };
    }

    // 2. Validate tier
    const tierPriceUsd = TIER_PRICES_USD[expectedTier.toLowerCase()];
    if (!tierPriceUsd) {
      return { valid: false, token: '', amount: '0', amountUsd: 0, recipient: '', sender: '', error: `Unknown tier: ${expectedTier}` };
    }

    const connection = getConnection();
    const recipient = getPlatformWallet();

    // 3. Try SOL first, then SPL tokens
    let verificationError: string | null = null;

    for (const [tokenSymbol, mint] of Object.entries(SUPPORTED_MINTS)) {
      if (!mint || (tokenSymbol === 'HERD' && !mint)) continue;

      try {
        const amount = toNativeAmount(tierPriceUsd, tokenSymbol, 150); // fallback SOL price

        const validateOpts: {
          recipient: PublicKey;
          amount: BigNumber;
          splToken?: PublicKey;
        } = { recipient, amount };

        if (tokenSymbol !== 'SOL') {
          validateOpts.splToken = new PublicKey(mint);
        }

        // Cast to any due to @solana/pay expecting Rpc<GetTransactionApi> from web3.js v2
        // while we use Connection from v1.x — the runtime behavior is identical
        const result = await validateTransfer(
          connection as any,
          txSignature as any,
          validateOpts as any
        );

        // validateTransfer returns the parsed transfer info on success
        if (result) {
          const amountInTokenUnits = tokenSymbol === 'SOL'
            ? amount.dividedBy(10 ** TOKEN_DECIMALS.SOL).toNumber()
            : amount.dividedBy(10 ** (TOKEN_DECIMALS[tokenSymbol] ?? 6)).toNumber();

          return {
            valid: true,
            token: tokenSymbol,
            amount: amountInTokenUnits.toString(),
            amountUsd: tierPriceUsd,
            recipient: recipient.toBase58(),
            sender: 'unknown', // @solana/pay doesn't expose sender in result
          };
        }
      } catch (err) {
        // This token didn't match, try next
        verificationError = err instanceof Error ? err.message : 'Verification failed';
        continue;
      }
    }

    // 4. No matching transfer found
    return {
      valid: false,
      token: '',
      amount: '0',
      amountUsd: 0,
      recipient: recipient.toBase58(),
      sender: '',
      error: verificationError || `No valid transfer to platform wallet (${recipient.toBase58()}) found`,
    };
  } catch (err) {
    return {
      valid: false,
      token: '',
      amount: '0',
      amountUsd: 0,
      recipient: '',
      sender: '',
      error: err instanceof Error ? err.message : 'Unknown verification error',
    };
  }
}

/**
 * Get tier price in USD
 */
export function getTierPriceUsd(tier: string): number | null {
  return TIER_PRICES_USD[tier.toLowerCase()] ?? null;
}

/**
 * Get supported tokens and their mints
 */
export function getSupportedTokens(): Array<{ symbol: string; mint: string }> {
  return Object.entries(SUPPORTED_MINTS)
    .filter(([, mint]) => mint)
    .map(([symbol, mint]) => ({ symbol, mint }));
}
