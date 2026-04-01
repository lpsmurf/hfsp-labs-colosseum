/**
 * Agent and Tenant Type Definitions
 * Used across the web app for type safety
 */

export interface Tenant {
  id: string;
  name: string;
  email: string;
  telegram_user_id: number;
  created_at: string;
  updated_at: string;
  billing_status: 'active' | 'suspended' | 'inactive';
  subscription_tier: 'free' | 'pro' | 'enterprise';
}

export interface Agent {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  status: AgentStatus;
  provisioning_status: ProvisioningStatus;
  vps_instance_id?: string;
  api_key: string;
  created_at: string;
  updated_at: string;
  last_heartbeat?: string;
  config: AgentConfig;
}

export type AgentStatus = 'active' | 'inactive' | 'paused' | 'error';
export type ProvisioningStatus = 'pending' | 'ssh_key_installed' | 'container_started' | 'active' | 'failed';

export interface AgentConfig {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  system_prompt?: string;
  tools?: string[];
  webhook_url?: string;
}

export interface ProvisioningEvent {
  agent_id: string;
  tenant_id: string;
  status: ProvisioningStatus;
  timestamp: string;
  error?: string;
  details?: Record<string, any>;
}

export interface AgentSetupPayload {
  name: string;
  description?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  system_prompt?: string;
  webhook_url?: string;
}

export interface CreateAgentRequest extends AgentSetupPayload {}

export interface UpdateAgentRequest extends Partial<AgentSetupPayload> {
  status?: AgentStatus;
}

export interface DeleteAgentResponse {
  success: boolean;
  message: string;
}

export interface AgentListResponse {
  agents: Agent[];
  total: number;
  page: number;
  page_size: number;
}

export interface TenantInfo {
  tenant: Tenant;
  agent_count: number;
  vps_usage: VPSUsage;
}

export interface VPSUsage {
  instances_used: number;
  instances_available: number;
  storage_gb: number;
  bandwidth_gb: number;
}
