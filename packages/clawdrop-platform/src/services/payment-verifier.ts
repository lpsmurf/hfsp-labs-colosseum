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
  free_trial: 0.10,
  starter: 29,
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

async function getSolPriceUsd(): Promise<number> {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
      { headers: { Accept: 'application/json' } }
    );
    const data = (await response.json()) as { solana?: { usd?: number } };
    return data.solana?.usd ?? 150;
  } catch {
    return 150;
  }
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
  expectedToken: string,
): Promise<PaymentVerification> {
  // Devnet / staging bypass — set BYPASS_PAYMENT_VERIFY=true to skip on-chain check
  if (process.env.BYPASS_PAYMENT_VERIFY === 'true') {
    const tierPriceUsd = TIER_PRICES_USD[expectedTier.toLowerCase()] ?? 19;
    return { valid: true, token: expectedToken.toUpperCase(), amount: '1', amountUsd: tierPriceUsd, recipient: process.env.PLATFORM_WALLET_ADDRESS ?? '', sender: 'devnet-bypass' };
  }

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

    const tokenSymbol = expectedToken.toUpperCase();
    const mint = SUPPORTED_MINTS[tokenSymbol];
    if (!mint || (tokenSymbol === 'HERD' && !mint)) {
      return { valid: false, token: '', amount: '0', amountUsd: 0, recipient: '', sender: '', error: `Unsupported token: ${expectedToken}` };
    }

    const connection = getConnection();
    const recipient = getPlatformWallet();
    const solPriceUsd = tokenSymbol === 'SOL' ? await getSolPriceUsd() : 150;
    const amount = toNativeAmount(tierPriceUsd, tokenSymbol, solPriceUsd);

    const validateOpts: {
      recipient: PublicKey;
      amount: BigNumber;
      splToken?: PublicKey;
    } = { recipient, amount };

    if (tokenSymbol !== 'SOL') {
      validateOpts.splToken = new PublicKey(mint);
    }

    try {
      // AUDIT: MEDIUM — `as any` casts hide a version mismatch between @solana/pay
      // (expects web3.js v2 Rpc<GetTransactionApi>) and the project's web3.js v1.x
      // Connection type. Runtime behavior is currently identical, but upgrading either
      // package could silently break validation. Add an integration test for payment
      // verification and pin both @solana/pay and @solana/web3.js versions.
      // Cast to any due to @solana/pay expecting Rpc<GetTransactionApi> from web3.js v2
      // while we use Connection from v1.x — the runtime behavior is identical
      await validateTransfer(
        connection as any,
        txSignature as any,
        validateOpts as any
      );

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
    } catch (err) {
      return {
        valid: false,
        token: '',
        amount: '0',
        amountUsd: 0,
        recipient: recipient.toBase58(),
        sender: '',
        error: err instanceof Error ? err.message : 'Verification failed',
      };
    }
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
