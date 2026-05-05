/**
 * Agent and Tenant Type Definitions
 */

export type AgentStatus = 'active' | 'awaiting_pairing' | 'provisioning' | 'failed' | 'inactive';

export interface Agent {
  id: string;
  name: string;
  provider: string;
  model: string;
  dashboardPort: number;
  status: AgentStatus;
  createdAt: string;
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
