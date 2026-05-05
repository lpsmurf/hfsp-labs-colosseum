/**
 * Agent and Tenant Type Definitions
 */

export type AgentStatus = 'active' | 'awaiting_pairing' | 'provisioning' | 'failed' | 'inactive';
export type ProvisioningStatus = 'pending' | 'ssh_key_installed' | 'container_started' | 'active' | 'failed';

export interface Agent {
  id: string;
  name: string;
  provider: string;
  model: string;
  dashboardPort: number;
  status: AgentStatus;
  createdAt: string;
  provisioning_status?: ProvisioningStatus;
  last_heartbeat?: string;
  description?: string;
  config?: {
    model?: string;
    temperature?: number;
  };
  api_key?: string;
}

export interface ProvisioningEvent {
  agent_id: string;
  status: ProvisioningStatus;
  progress?: number;
  error?: string;
}

export interface AgentSetupPayload {
  name: string;
  provider: string;
  model: string;
  botToken: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  openrouterApiKey?: string;
}

export interface UpdateAgentRequest {
  name?: string;
}

export interface DeleteAgentResponse {
  success: boolean;
  message: string;
}

export interface AgentListResponse {
  agents: Agent[];
}
