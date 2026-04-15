import { z } from 'zod';

/**
 * Deployment Model - tracks deployed OpenClaw instances
 * Renamed from "DeployedAgent" to be more precise about what it represents
 */

export const DeploymentSchema = z.object({
  deployment_id: z.string().describe('Unique deployment identifier'),
  tier_id: z.string().describe('Tier that was deployed'),
  agent_id: z.string().describe('OpenClaw agent ID from HFSP'),
  agent_name: z.string().describe('Human-readable agent name'),
  wallet_address: z.string().describe('Customer wallet address'),
  payment_id: z.string().describe('Payment ID that verified this deployment'),
  status: z.enum(['provisioning', 'running', 'paused', 'failed', 'stopped']),
  endpoint: z.string().url().nullable().describe('Agent endpoint once running'),
  console_url: z.string().url().nullable().describe('Console URL for management'),
  region: z.string().describe('Hosting region'),
  capability_bundle: z.string().describe('Deployed capability bundle'),
  config: z.record(z.any()).optional().describe('Custom configuration'),
  deployed_at: z.date(),
  last_activity: z.date(),
  logs: z.array(z.object({
    timestamp: z.date(),
    level: z.enum(['info', 'warn', 'error']),
    message: z.string(),
  })),
});

export type Deployment = z.infer<typeof DeploymentSchema>;
