import { z } from 'zod';

export const TierIdSchema = z.enum(['tier_explorer', 'tier_a', 'tier_b']);
export const PaymentTokenSchema = z.enum(['SOL', 'USDT', 'USDC', 'HERD']);
export const LLMProviderSchema = z.enum(['anthropic', 'openai', 'openrouter', 'kimi']).default('anthropic');

export const DeploymentRequestSchema = z.object({
  tier_id: TierIdSchema,
  agent_name: z.string().min(3).max(64),
  owner_wallet: z.string().min(32).max(44), // Solana address
  payment_token: PaymentTokenSchema,
  payment_tx_hash: z.string().min(1),
  telegram_token: z.string().regex(/^\d+:[a-zA-Z0-9_-]+$/),
  llm_provider: LLMProviderSchema.optional(),
  llm_api_key: z.string().optional(),
  bundles: z.array(z.string()).optional(),
  idempotency_key: z.string().uuid().optional(),
});

export type DeploymentRequest = z.infer<typeof DeploymentRequestSchema>;

export const DeploymentResponseSchema = z.object({
  success: z.boolean(),
  deployment_id: z.string().uuid(),
  data: z.object({
    agent_id: z.string(),
    agent_name: z.string(),
    tier_id: TierIdSchema,
    status: z.string(),
    bundles: z.array(z.string()),
    deployed_at: z.string().datetime(),
    next_payment_due: z.string().datetime(),
    console_url: z.string().url(),
    message: z.string(),
  }),
});

export type DeploymentResponse = z.infer<typeof DeploymentResponseSchema>;

// Tier information for UI
export const TIER_INFO = {
  tier_explorer: {
    label: 'Explorer',
    description: 'Perfect for getting started',
    price: 'Free to start',
  },
  tier_a: {
    label: 'Tier A',
    description: 'Enhanced features and priority support',
    price: '$50/month',
  },
  tier_b: {
    label: 'Tier B',
    description: 'Full features with dedicated support',
    price: '$200/month',
  },
};

export const PAYMENT_TOKEN_INFO = {
  SOL: { label: 'Solana', symbol: 'SOL' },
  USDT: { label: 'Tether', symbol: 'USDT' },
  USDC: { label: 'USDC', symbol: 'USDC' },
  HERD: { label: 'HERD Token', symbol: 'HERD' },
};
