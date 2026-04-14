import { z } from 'zod';

// Service catalog schemas
export const ServiceSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.enum(['agent', 'wallet', 'treasury', 'research', 'finance']),
  price_sol: z.number().positive(),
  price_herd: z.number().positive(),
  deployment_type: z.enum(['openclaw', 'custom']),
});

export type Service = z.infer<typeof ServiceSchema>;

// Tool request/response schemas
export const ListServicesRequestSchema = z.object({});

export const ListServicesResponseSchema = z.object({
  services: z.array(ServiceSchema),
  total_count: z.number(),
});

export const QuoteServiceRequestSchema = z.object({
  service_id: z.string(),
  token: z.enum(['sol', 'herd']).default('sol'),
});

export const QuoteServiceResponseSchema = z.object({
  service_id: z.string(),
  service_name: z.string(),
  price: z.number(),
  token: z.enum(['sol', 'herd']),
  estimated_gas: z.number().optional(),
  total_with_gas: z.number(),
  valid_until: z.string().datetime(),
});

export const PayWithSolRequestSchema = z.object({
  service_id: z.string(),
  amount_sol: z.number().positive(),
  wallet_pubkey: z.string(),
  approve: z.boolean(),
});

export const PayWithSolResponseSchema = z.object({
  tx_hash: z.string(),
  status: z.enum(['pending', 'confirmed', 'failed']),
  amount_sol: z.number(),
  timestamp: z.string().datetime(),
});

export const CreateOpenclavAgentRequestSchema = z.object({
  service_id: z.string(),
  agent_name: z.string(),
  agent_description: z.string().optional(),
  config: z.record(z.any()).optional(),
});

export const CreateOpenclawAgentResponseSchema = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  status: z.enum(['provisioning', 'running', 'failed']),
  deployed_at: z.string().datetime(),
  console_url: z.string().url().optional(),
});

export const GetAgentStatusRequestSchema = z.object({
  agent_id: z.string(),
});

export const GetAgentStatusResponseSchema = z.object({
  agent_id: z.string(),
  status: z.enum(['initializing', 'provisioning', 'running', 'paused', 'failed', 'stopped']),
  uptime_seconds: z.number(),
  last_activity: z.string().datetime(),
  logs: z.array(z.object({
    timestamp: z.string().datetime(),
    level: z.enum(['info', 'warn', 'error']),
    message: z.string(),
  })).optional(),
});

export const ToolInputMap = {
  list_services: ListServicesRequestSchema,
  quote_service: QuoteServiceRequestSchema,
  pay_with_sol: PayWithSolRequestSchema,
  create_openclaw_agent: CreateOpenclavAgentRequestSchema,
  get_agent_status: GetAgentStatusRequestSchema,
};

export const ToolOutputMap = {
  list_services: ListServicesResponseSchema,
  quote_service: QuoteServiceResponseSchema,
  pay_with_sol: PayWithSolResponseSchema,
  create_openclaw_agent: CreateOpenclawAgentResponseSchema,
  get_agent_status: GetAgentStatusResponseSchema,
};
