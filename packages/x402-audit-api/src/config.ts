import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT:                z.string().default('3008'),
  NODE_ENV:            z.string().default('development'),

  // x402 V2 facilitator — verifies and settles payments on our behalf.
  // NOT x402.org: that one is testnet-only and these are mainnet routes.
  // @hfsp/x402-common throws at boot if this is set to x402.org.
  FACILITATOR_URL:         z.string().url().default('https://facilitator.payai.network'),

  // Base (EVM) payment
  BASE_RPC_URL:            z.string().default('https://mainnet.base.org'),
  PAYMENT_RECIPIENT_BASE:  z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Must be a valid EVM address'),

  // Solana payment
  SOLANA_RPC_URL:          z.string().default('https://api.mainnet-beta.solana.com'),
  PAYMENT_RECIPIENT_SOL:   z.string().min(32, 'Must be a valid Solana base58 address'),

  // Celo payment — optional. Offered only when both are set: payai does not
  // settle Celo, so Celo routes go through Celo Core Co.'s facilitator, whose
  // /settle is key-gated. Key: x402.celo.org dashboard.
  PAYMENT_RECIPIENT_CELO:  z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Must be a valid EVM address').optional(),
  CELO_FACILITATOR_API_KEY: z.string().optional(),
  // celoSepolia for end-to-end tests before real money moves.
  CELO_NETWORK:            z.enum(['celo', 'celoSepolia']).default('celo'),

  GITHUB_TOKEN:        z.string().optional(),
  // ACE Data Cloud — OpenAI via x402 (AI summary, and the fallback detection
  // transport). The audit service buying its own inference over the protocol it
  // audits is deliberate.
  ACEDATA_API_KEY:               z.string().optional(),
  ACEDATA_FACILITATOR_ADDRESS:   z.string().optional(),

  // AI detection pass. Unlike the summary, this reads source and proposes its
  // own findings, so quality is model-bound — 81% of real audit findings are
  // logic bugs that need reasoning, not pattern matching.
  ANTHROPIC_API_KEY:             z.string().optional(),
  // OpenRouter fronts every provider behind one key and one bill, which is the
  // right default for comparing detection quality across models.
  OPENROUTER_API_KEY:            z.string().optional(),
  AI_DETECT_MODEL:               z.string().default('claude-sonnet-5'),
  AI_DETECT_MODEL_FALLBACK:      z.string().default('gpt-4o'),
  // 'auto' picks the first configured provider. 'file' calls no provider at
  // all: it writes the prompt to disk and reads the reply back, so a human or
  // a chat session can stand in for the model while the approach is still being
  // validated. See scripts/ai-detect-manual.ts.
  AI_DETECT_MODE:                z.enum(['auto', 'file']).default('auto'),
  AI_DETECT_PROMPT_PATH:         z.string().default('/tmp/ai-detect-prompt.txt'),
  AI_DETECT_RESPONSE_PATH:       z.string().default('/tmp/ai-detect-response.json'),
  // ~160k chars is roughly 40k tokens of source, leaving room for the response.
  AI_DETECT_CHAR_BUDGET:         z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('[config] Missing required environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;

export const BASE_USDC        = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const SOLANA_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const AUDIT_PRICE_USDC = 0.99;
