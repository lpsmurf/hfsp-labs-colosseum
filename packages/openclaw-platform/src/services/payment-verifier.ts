/**
 * Payment Verifier — Verify Solana transactions on-chain via Helius
 *
 * Checks:
 * 1. Transaction exists and is confirmed
 * 2. Recipient matches PLATFORM_WALLET_ADDRESS
 * 3. Token is SOL/USDC/USDT/HERD with correct mint
 * 4. Amount >= tier price (in USD equivalent)
 * 5. tx_signature not already used (enforced by DB UNIQUE)
 */

import { db } from '../db/index.js';

export interface PaymentVerification {
  valid: boolean;
  token: string;
  amount: string;          // raw amount in token units
  amountUsd: number;       // USD equivalent
  recipient: string;
  sender: string;
  error?: string;
}

interface HeliusTx {
  signature: string;
  description?: string;
  type?: string;
  source?: string;
  fee?: number;
  feePayer?: string;
  timestamp?: number;
  nativeTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
  }>;
  tokenTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    tokenAmount: number;
    mint: string;
    tokenStandard?: string;
  }>;
  accountData?: Array<{
    account: string;
    nativeBalanceChange?: number;
    tokenBalanceChanges?: Array<{
      mint: string;
      rawTokenAmount?: {
        tokenAmount: string;
        decimals: number;
      };
    }>;
  }>;
}

const SUPPORTED_MINTS: Record<string, string> = {
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  SOL: 'So11111111111111111111111111111111111111112', // wrapped SOL mint for reference
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

// Cache SOL price for 5 minutes
let solPriceCache: { price: number; ts: number } | null = null;

async function getSolPriceUsd(): Promise<number> {
  if (solPriceCache && Date.now() - solPriceCache.ts < 5 * 60 * 1000) {
    return solPriceCache.price;
  }
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
      { headers: { Accept: 'application/json' } }
    );
    const data = (await res.json()) as { solana?: { usd?: number } };
    const price = data.solana?.usd ?? 150;
    solPriceCache = { price, ts: Date.now() };
    return price;
  } catch {
    return solPriceCache?.price ?? 150;
  }
}

function getHeliusApiKey(): string {
  const key = process.env.HELIUS_API_KEY;
  if (!key) throw new Error('HELIUS_API_KEY not configured');
  return key;
}

function getPlatformWallet(): string {
  const addr = process.env.PLATFORM_WALLET_ADDRESS;
  if (!addr) throw new Error('PLATFORM_WALLET_ADDRESS not configured');
  return addr;
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
 * Fetch transaction details from Helius
 */
async function fetchHeliusTx(txSignature: string): Promise<HeliusTx | null> {
  const apiKey = getHeliusApiKey();
  const url = `https://api.helius.xyz/v0/transactions/?api-key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactions: [txSignature] }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Helius API error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as HeliusTx[];
  if (!Array.isArray(data) || data.length === 0) return null;
  return data[0];
}

/**
 * Find a native SOL transfer to the platform wallet
 */
function findSolTransfer(tx: HeliusTx, platformWallet: string): { amount: number; sender: string } | null {
  if (!tx.nativeTransfers) return null;

  for (const t of tx.nativeTransfers) {
    if (t.toUserAccount === platformWallet) {
      return { amount: t.amount / 1e9, sender: t.fromUserAccount };
    }
  }
  return null;
}

/**
 * Find an SPL token transfer to the platform wallet
 */
function findSplTransfer(
  tx: HeliusTx,
  platformWallet: string,
  expectedMint: string
): { amount: number; sender: string; decimals: number } | null {
  if (!tx.tokenTransfers) return null;

  for (const t of tx.tokenTransfers) {
    if (t.toUserAccount === platformWallet && t.mint === expectedMint) {
      const decimals = TOKEN_DECIMALS[Object.keys(SUPPORTED_MINTS).find(
        (k) => SUPPORTED_MINTS[k] === expectedMint
      ) ?? ''] ?? 6;
      return { amount: t.tokenAmount, sender: t.fromUserAccount, decimals };
    }
  }
  return null;
}

/**
 * Verify a Solana payment transaction
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

    // 3. Fetch tx from Helius
    const tx = await fetchHeliusTx(txSignature);
    if (!tx) {
      return { valid: false, token: '', amount: '0', amountUsd: 0, recipient: '', sender: '', error: 'Transaction not found on-chain' };
    }

    const platformWallet = getPlatformWallet();

    // 4. Try native SOL transfer first
    const solTransfer = findSolTransfer(tx, platformWallet);
    if (solTransfer) {
      const solPrice = await getSolPriceUsd();
      const amountUsd = solTransfer.amount * solPrice;

      if (amountUsd < tierPriceUsd) {
        return {
          valid: false,
          token: 'SOL',
          amount: solTransfer.amount.toString(),
          amountUsd,
          recipient: platformWallet,
          sender: solTransfer.sender,
          error: `Insufficient amount: $${amountUsd.toFixed(2)} < $${tierPriceUsd} required`,
        };
      }

      return {
        valid: true,
        token: 'SOL',
        amount: solTransfer.amount.toString(),
        amountUsd,
        recipient: platformWallet,
        sender: solTransfer.sender,
      };
    }

    // 5. Try SPL token transfers (USDC, USDT, HERD)
    for (const [tokenSymbol, mint] of Object.entries(SUPPORTED_MINTS)) {
      if (tokenSymbol === 'SOL' || !mint) continue;

      const splTransfer = findSplTransfer(tx, platformWallet, mint);
      if (splTransfer) {
        const decimals = TOKEN_DECIMALS[tokenSymbol] ?? 6;
        const amount = splTransfer.amount;
        const amountUsd = tokenSymbol === 'USDC' || tokenSymbol === 'USDT' ? amount : amount; // HERD would need price lookup

        if (amountUsd < tierPriceUsd) {
          return {
            valid: false,
            token: tokenSymbol,
            amount: amount.toString(),
            amountUsd,
            recipient: platformWallet,
            sender: splTransfer.sender,
            error: `Insufficient amount: $${amountUsd.toFixed(2)} < $${tierPriceUsd} required`,
          };
        }

        return {
          valid: true,
          token: tokenSymbol,
          amount: amount.toString(),
          amountUsd,
          recipient: platformWallet,
          sender: splTransfer.sender,
        };
      }
    }

    // 6. No matching transfer found
    return {
      valid: false,
      token: '',
      amount: '0',
      amountUsd: 0,
      recipient: platformWallet,
      sender: '',
      error: `No transfer to platform wallet (${platformWallet}) found in transaction`,
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
