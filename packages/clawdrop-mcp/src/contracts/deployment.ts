import { z } from 'zod';

/**
 * Deployment Contract
 * Interface between Clawdrop Control Plane and HFSP Provisioner
 * Defines what the control plane sends to request deployment
 */

export const DeploymentRequestSchema = z.object({
  deployment_id: z.string().describe('Unique deployment identifier'),
  tier_id: z.string().describe('Tier being deployed'),
  region: z.string().default('us-east').describe('Hosting region'),
  capability_bundle: z.string().describe('Capability bundle identifier (e.g., travel-crypto-pro)'),
  payment_verified: z.boolean().describe('Whether payment was verified on-chain'),
  wallet_address: z.string().describe('Customer wallet address'),
  config: z.record(z.any()).optional().describe('Optional custom configuration'),
});

export type DeploymentRequest = z.infer<typeof DeploymentRequestSchema>;

export const DeploymentResponseSchema = z.object({
  deployment_id: z.string(),
  agent_id: z.string().describe('Deployed OpenClaw agent ID'),
  endpoint: z.string().url().describe('Agent endpoint URL'),
  status: z.enum(['provisioning', 'running', 'failed']).describe('Current deployment status'),
  error: z.string().nullable().describe('Error message if failed'),
});

export type DeploymentResponse = z.infer<typeof DeploymentResponseSchema>;

/**
 * Provisioner Contract
 * Interface between HFSP Provisioner and Runtime
 * Defines what HFSP returns after provisioning
 */

export const ProvisionerStatusResponseSchema = z.object({
  agent_id: z.string(),
  status: z.enum(['provisioning', 'running', 'failed', 'stopped']),
  health: z.enum(['healthy', 'degraded', 'failing']),
  endpoint: z.string().url().optional(),
  capabilities: z.array(z.string()).optional(),
  logs: z.array(z.string()).optional(),
  error: z.string().nullable().optional(),
});

export type ProvisionerStatusResponse = z.infer<typeof ProvisionerStatusResponseSchema>;
