import { z } from 'zod';

// Solana base58 public key: 32-44 chars, base58 alphabet
const SolanaWalletSchema = z
  .string()
  .min(32)
  .max(44)
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, 'Invalid Solana wallet address (must be base58)');

// ─── Shared enums ─────────────────────────────────────────────────────────────

export const PaymentTokenSchema = z.enum(['SOL', 'USDT', 'USDC', 'HERD']);
export const BundleSchema = z.enum(['solana', 'research', 'treasury', 'travel-crypto-pro']);
export const AgentStatusSchema = z.enum([
  'provisioning',
  'running',
  'paused',
  'failed',
  'stopped',
]);

// ─── list_tiers ───────────────────────────────────────────────────────────────

export const ListTiersInputSchema = z.object({});

export const TierInfoSchema = z.object({
  tier_id: z.string(),
  name: z.string(),
  description: z.string(),
  price_usd: z.number(),
  vps_type: z.enum(['shared-docker', 'dedicated-vps']),
  vps_capacity: z.string(),
  available_bundles: z.array(BundleSchema),
});

export const ListTiersOutputSchema = z.object({
  tiers: z.array(TierInfoSchema),
});

// ─── quote_tier ───────────────────────────────────────────────────────────────

export const QuoteTierInputSchema = z.object({
  tier_id: z.string().describe('Tier to quote: tier_explorer, tier_a, or tier_b'),
  payment_token: PaymentTokenSchema.default('SOL').describe(
    'Token you want to pay with'
  ),
  bundles: z
    .array(BundleSchema)
    .default([])
    .describe('Optional capability bundles (do not affect price)'),
});

export const QuoteTierOutputSchema = z.object({
  tier_id: z.string(),
  tier_name: z.string(),
  price_usd: z.number(),
  price_in_token: z.number(),
  payment_token: PaymentTokenSchema,
  fee_usd: z.number(),
  fee_breakdown: z.string(),
  bundles_included: z.array(BundleSchema),
  quote_expires_at: z.string().datetime(),
});

// ─── deploy_agent ─────────────────────────────────────────────────────────────

export const DeployAgentInputSchema = z.object({
  tier_id: z.string().describe('Tier to deploy on: tier_explorer, tier_a, or tier_b'),
  agent_name: z.string().min(3).max(64).describe('Display name for your agent'),
  owner_wallet: SolanaWalletSchema.describe('Your Solana wallet public key'),
  payment_token: PaymentTokenSchema.describe('Token used for payment'),
  payment_tx_hash: z.string().describe('Transaction hash proving payment'),
  bundles: z
    .array(BundleSchema)
    .default([])
    .describe('Capability bundles to install (solana, research, treasury, travel-crypto-pro)'),
  telegram_token: z
    .string()
    .optional()
    .describe('Telegram bot token (from @BotFather) — enables your agent on Telegram'),
  llm_provider: z
    .enum(['anthropic', 'openai', 'openrouter'])
    .default('anthropic')
    .describe('LLM provider for your agent'),
  llm_api_key: z
    .string()
    .optional()
    .describe('API key for your chosen LLM provider'),
});

export const DeployAgentOutputSchema = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  tier_id: z.string(),
  status: AgentStatusSchema,
  bundles: z.array(BundleSchema),
  deployed_at: z.string().datetime(),
  next_payment_due: z.string().datetime(),
  console_url: z.string().url().optional(),
  message: z.string(),
});

// ─── get_deployment_status ────────────────────────────────────────────────────

export const GetDeploymentStatusInputSchema = z.object({
  agent_id: z.string().describe('The agent ID returned from deploy_agent'),
  owner_wallet: SolanaWalletSchema.describe('Your Solana wallet public key (proves ownership)'),
});

export const GetDeploymentStatusOutputSchema = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  tier_id: z.string(),
  status: AgentStatusSchema,
  bundles: z.array(BundleSchema),
  vps_ip: z.string().optional(),
  console_url: z.string().url().optional(),
  uptime_seconds: z.number(),
  last_activity: z.string().datetime(),
  subscription: z.object({
    next_payment_due: z.string().datetime(),
    grace_period_end: z.string().datetime().nullable(),
    amount_usd: z.number(),
    payment_token: PaymentTokenSchema,
    payments_made: z.number(),
  }),
  recent_logs: z.array(
    z.object({
      timestamp: z.string().datetime(),
      level: z.enum(['info', 'warn', 'error']),
      message: z.string(),
    })
  ),
  warning: z.string().nullable(),
});

// ─── cancel_subscription ─────────────────────────────────────────────────────

export const CancelSubscriptionInputSchema = z.object({
  agent_id: z.string().describe('The agent ID to cancel'),
  owner_wallet: SolanaWalletSchema.describe('Your Solana wallet public key (proves ownership)'),
  confirm: z
    .literal(true)
    .describe('Must be true to confirm cancellation — agent will be stopped'),
});

export const CancelSubscriptionOutputSchema = z.object({
  agent_id: z.string(),
  status: z.literal('stopped'),
  message: z.string(),
  stopped_at: z.string().datetime(),
});


// ─── renew_subscription ───────────────────────────────────────────────────────

export const RenewSubscriptionInputSchema = z.object({
  agent_id: z.string().describe('Agent ID to renew'),
  owner_wallet: z.string().describe('Your Solana wallet public key (proves ownership)'),
  payment_tx_hash: z.string().describe('Transaction hash of renewal payment'),
  payment_token: z.enum(['SOL', 'USDC', 'USDT']).default('SOL'),
});

export const RenewSubscriptionOutputSchema = z.object({
  agent_id: z.string(),
  status: z.string(),
  renewed_until: z.string(),
  message: z.string(),
  was_stopped: z.boolean(),
  restarted: z.boolean(),
});

// ─── start_deployment_walkthrough ────────────────────────────────────────────

export const StartDeploymentWalkthroughInputSchema = z.object({
  step: z.number().min(0).max(5).default(0),
  selected_tier: z.string().optional(),
  selected_token: z.string().optional(),
  owner_wallet: z.string().optional(),
  agent_name: z.string().optional(),
  bundles: z.array(BundleSchema).default([]).optional(),
  llm_provider: z.enum(['anthropic', 'openai', 'openrouter']).optional(),
  llm_api_key: z.string().optional(),
  telegram_token: z.string().optional(),
  detected_tx: z.string().optional(),
});

// ─── Tool input/output maps ───────────────────────────────────────────────────

export const ToolInputSchemas = {
  list_tiers: ListTiersInputSchema,
  quote_tier: QuoteTierInputSchema,
  deploy_agent: DeployAgentInputSchema,
  get_deployment_status: GetDeploymentStatusInputSchema,
  cancel_subscription: CancelSubscriptionInputSchema,
  renew_subscription: RenewSubscriptionInputSchema,
  start_deployment_walkthrough: StartDeploymentWalkthroughInputSchema,
} as const;
