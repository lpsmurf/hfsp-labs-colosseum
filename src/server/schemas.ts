import { z } from 'zod';
import { TierSchema } from '../models/tier';
import { DeploymentSchema } from '../models/deployment';
import { PaymentSchema } from '../models/payment';

// ============================================================================
// Re-export Models
// ============================================================================

export type Tier = z.infer<typeof TierSchema>;
export type Deployment = z.infer<typeof DeploymentSchema>;
export type Payment = z.infer<typeof PaymentSchema>;

// ============================================================================
// Tool Request/Response Schemas (RENAMED)
// ============================================================================

// LIST_TIERS (was list_services)
export const ListTiersRequestSchema = z.object({});

export const ListTiersResponseSchema = z.object({
  tiers: z.array(TierSchema),
  total_count: z.number(),
});

// QUOTE_TIER (was quote_service)
export const QuoteTierRequestSchema = z.object({
  tier_id: z.string().describe('The ID of the tier to quote'),
  token: z.enum(['sol', 'herd']).default('sol').describe('Token to quote in'),
});

export const QuoteTierResponseSchema = z.object({
  tier_id: z.string(),
  tier_name: z.string(),
  price: z.number(),
  token: z.enum(['sol', 'herd']),
  estimated_gas: z.number().optional(),
  total_with_gas: z.number(),
  valid_until: z.string().datetime(),
});

// VERIFY_PAYMENT (was pay_with_sol)
export const VerifyPaymentRequestSchema = z.object({
  payment_id: z.string().describe('Payment ID to verify'),
  tx_hash: z.string().describe('Solana devnet transaction hash'),
});

export const VerifyPaymentResponseSchema = z.object({
  payment_id: z.string(),
  verified: z.boolean(),
  tx_hash: z.string(),
  amount_sol: z.number(),
  amount_usd: z.number(),
  status: z.enum(['pending', 'confirmed', 'failed']),
  explorer_url: z.string().url(),
});

// DEPLOY_OPENCLAW_INSTANCE (was create_openclaw_agent)
export const DeployOpenclawInstanceRequestSchema = z.object({
  tier_id: z.string().describe('The tier to deploy'),
  payment_id: z.string().describe('Payment ID that verified this deployment'),
  agent_name: z.string().describe('Human-readable name for the agent'),
  agent_description: z.string().optional().describe('Description of the agent'),
  wallet_address: z.string().describe('Customer wallet address'),
  region: z.string().default('us-east').describe('Hosting region'),
  config: z.record(z.any()).optional().describe('Custom configuration'),
});

export const DeployOpenclawInstanceResponseSchema = z.object({
  deployment_id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
  status: z.enum(['provisioning', 'running', 'failed']),
  deployed_at: z.string().datetime(),
  console_url: z.string().url().optional(),
});

// GET_DEPLOYMENT_STATUS (was get_agent_status)
export const GetDeploymentStatusRequestSchema = z.object({
  deployment_id: z.string().describe('The deployment ID'),
});

export const GetDeploymentStatusResponseSchema = z.object({
  deployment_id: z.string(),
  agent_id: z.string(),
  status: z.enum(['provisioning', 'running', 'paused', 'failed', 'stopped']),
  uptime_seconds: z.number(),
  last_activity: z.string().datetime(),
  endpoint: z.string().url().optional(),
  logs: z.array(z.object({
    timestamp: z.string().datetime(),
    level: z.enum(['info', 'warn', 'error']),
    message: z.string(),
  })).optional(),
});

// ============================================================================
// Tool Input/Output Maps
// ============================================================================

export const ToolInputMap = {
  list_tiers: ListTiersRequestSchema,
  quote_tier: QuoteTierRequestSchema,
  verify_payment: VerifyPaymentRequestSchema,
  deploy_openclaw_instance: DeployOpenclawInstanceRequestSchema,
  get_deployment_status: GetDeploymentStatusRequestSchema,
};

export const ToolOutputMap = {
  list_tiers: ListTiersResponseSchema,
  quote_tier: QuoteTierResponseSchema,
  verify_payment: VerifyPaymentResponseSchema,
  deploy_openclaw_instance: DeployOpenclawInstanceResponseSchema,
  get_deployment_status: GetDeploymentStatusResponseSchema,
};
