// Kimi: implement this service
// Verify a Solana transaction on-chain via Helius
// Check: recipient, token mint, amount, not already used

export interface PaymentVerification {
  valid: boolean;
  token: string;
  amount: string;
  recipient: string;
  error?: string;
}

const SUPPORTED_MINTS: Record<string, string> = {
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  // SOL: native (no mint)
  // HERD: from env HERD_MINT_ADDRESS
};

const TIER_PRICES_USDC: Record<string, number> = {
  starter: 19,
  pro: 59,
};

export async function verifyPayment(
  txSignature: string,
  expectedTier: string,
): Promise<PaymentVerification> {
  // TODO (Kimi): implement
  // 1. Call Helius: GET https://api.helius.xyz/v0/transactions/?api-key=${HELIUS_KEY}
  //    Body: { transactions: [txSignature] }
  // 2. Parse response: find transfer to PLATFORM_WALLET_ADDRESS
  // 3. Identify token (SOL native or SPL mint)
  // 4. Verify amount >= TIER_PRICES_USDC[expectedTier] in USD equivalent
  // 5. Return { valid, token, amount, recipient }
  throw new Error('payment-verifier.ts not yet implemented — Kimi to build');
}
