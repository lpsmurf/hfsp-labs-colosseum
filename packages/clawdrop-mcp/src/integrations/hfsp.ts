import axios from 'axios';
import logger from '../utils/logger';

/**
 * HFSP (hfsp-agent-provisioning) Integration
 * Manages agent deployment and status tracking
 * 
 * Real API implementation for Clawdrop MCP Gateway
 * See: https://github.com/lpsmurf/hfsp-agent-provisioning
 */

// Get config at runtime (not at module load) to ensure .env is loaded
function getHFSPConfig() {
  return {
    url: process.env.HFSP_URL || 'http://localhost:3001',
    key: process.env.HFSP_API_KEY || '',
  };
}

export interface AgentConfig {
  name: string;
  description?: string;
  model?: string;
  tools?: string[];
  instructions?: string;
  [key: string]: any;
}

export interface DeployedAgentInfo {
  agent_id: string;
  status: 'initializing' | 'running' | 'failed';
  url?: string;
  error?: string;
}

export interface AgentStatusInfo {
  agent_id: string;
  status: 'initializing' | 'running' | 'paused' | 'failed' | 'stopped' | 'error';
  uptime_seconds: number;
  logs: Array<{
    timestamp: string;
    level: 'info' | 'warn' | 'error';
    message: string;
  }>;
  health?: {
    cpu_usage: number;
    memory_usage: number;
    last_activity: string;
  };
}

/**
 * Clawdrop-specific deployment request interface
 * Used for deploying agents after payment verification
 */
export interface HFSPDeployRequest {
  deployment_id: string;
  tier_id: string;
  region: string;
  capability_bundle: string;
  payment_verified: boolean;
  wallet_address: string;
  telegram_token?: string;
  llm_provider?: string;
  llm_api_key?: string;
  config?: Record<string, any>;
}

/**
 * Clawdrop-specific deployment response
 */
export interface HFSPDeployResponse {
  agent_id: string;
  endpoint: string;
  status: 'provisioning' | 'running' | 'error';
  error: string | null;
}

/**
 * Deploy a new agent to HFSP
 * 
 * Real API call to HFSP /api/v1/agents/deploy endpoint
 * Body: { name, description, model, tools, instructions, ... }
 * Response: { agent_id, status, console_url, ... }
 */
export async function deployAgent(config: AgentConfig): Promise<DeployedAgentInfo> {
  try {
    logger.info({ agent_name: config.name }, 'Deploying agent to HFSP');
    const { url, key } = getHFSPConfig();

    const response = await axios.post(
      `${url}/api/v1/agents/deploy`,
      {
        name: config.name,
        description: config.description,
        model: config.model || 'claude-3-5-sonnet',
        tools: config.tools || [],
        instructions: config.instructions,
      },
      {
        headers: { 
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        timeout: 120000,
      }
    );

    const { agent_id, status, console_url, error } = response.data;
    
    if (error) {
      throw new Error(error);
    }

    logger.info(
      { agent_id, status, console_url },
      'Agent deployment initiated successfully'
    );

    return {
      agent_id,
      status: status || 'initializing',
      url: console_url || `${url}/agents/${agent_id}`,
    };
  } catch (error) {
    logger.error({ error, agent_name: config.name }, 'Agent deployment failed');
    
    if (axios.isAxiosError(error)) {
      if (error.response) {
        throw new Error(`HFSP deployment failed: ${error.response.data?.error || error.response.statusText}`);
      } else if (error.request) {
        throw new Error('HFSP deployment failed: No response from server. Is HFSP running?');
      }
    }
    
    throw new Error(`Failed to deploy agent: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get agent status and logs
 * 
 * Real API call to HFSP /api/v1/agents/:agent_id/status endpoint
 * Response: { status, logs, uptime, health, ... }
 */
export async function getAgentStatus(agentId: string): Promise<AgentStatusInfo> {
  try {
    logger.info({ agent_id: agentId }, 'Fetching agent status from HFSP');
    const { url, key } = getHFSPConfig();

    const response = await axios.get(
      `${url}/api/v1/agents/${agentId}/status`,
      {
        headers: { 'Authorization': `Bearer ${key}` },
        timeout: 10000,
      }
    );

    const { status, logs, uptime_seconds, health, error } = response.data;
    
    if (error) {
      throw new Error(error);
    }

    logger.info({ agent_id: agentId, status }, 'Agent status retrieved');

    return {
      agent_id: agentId,
      status: status || 'running',
      uptime_seconds: uptime_seconds || 0,
      logs: logs || [],
      health: health || {
        cpu_usage: 0,
        memory_usage: 0,
        last_activity: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error({ error, agent_id: agentId }, 'Failed to get agent status');
    
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 404) {
        throw new Error(`Agent not found: ${agentId}`);
      }
    }
    
    throw new Error(`Failed to get agent status: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get agent logs
 * 
 * Real API call to HFSP /api/v1/agents/:agent_id/logs endpoint
 * Response: { logs: [...] }
 */
export async function getAgentLogs(agentId: string): Promise<AgentStatusInfo['logs']> {
  try {
    logger.info({ agent_id: agentId }, 'Fetching agent logs from HFSP');
    const { url, key } = getHFSPConfig();

    const response = await axios.get(
      `${url}/api/v1/agents/${agentId}/logs`,
      {
        headers: { 'Authorization': `Bearer ${key}` },
        timeout: 10000,
      }
    );

    const { logs, error } = response.data;
    
    if (error) {
      throw new Error(error);
    }

    logger.info({ agent_id: agentId, logCount: logs?.length || 0 }, 'Agent logs retrieved');
    return logs || [];
  } catch (error) {
    logger.error({ error, agent_id: agentId }, 'Failed to get agent logs');
    throw error;
  }
}

/**
 * Delete/stop an agent
 * 
 * Real API call to HFSP DELETE /api/v1/agents/:agent_id endpoint
 */
export async function deleteAgent(agentId: string): Promise<boolean> {
  try {
    logger.info({ agent_id: agentId }, 'Deleting agent from HFSP');
    const { url, key } = getHFSPConfig();

    await axios.delete(
      `${url}/api/v1/agents/${agentId}`,
      {
        headers: { 'Authorization': `Bearer ${key}` },
        timeout: 10000,
      }
    );

    logger.info({ agent_id: agentId }, 'Agent deleted successfully');
    return true;
  } catch (error) {
    logger.error({ error, agent_id: agentId }, 'Failed to delete agent');
    
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 404) {
        // Agent already deleted or doesn't exist - consider it success
        logger.info({ agent_id: agentId }, 'Agent not found (already deleted)');
        return true;
      }
    }
    
    throw error;
  }
}

/**
 * Health check for HFSP API
 * Use this to verify HFSP is running before deploying
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const { url } = getHFSPConfig();
    const response = await axios.get(
      `${url}/health`,
      {
        timeout: 5000,
      }
    );

    const isHealthy = response.status === 200;
    
    if (isHealthy) {
      logger.info({ status: response.data?.status }, 'HFSP health check passed');
    } else {
      logger.warn({ status: response.status }, 'HFSP health check returned non-200');
    }
    
    return isHealthy;
  } catch (error) {
    logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'HFSP health check failed');
    return false;
  }
}

/**
 * Clawdrop-specific: Deploy an agent via HFSP after payment verification
 * 
 * This is the main deployment function used by the Clawdrop MCP Gateway.
 * It sends deployment requests to HFSP with payment verification status.
 * 
 * @param req - Deployment request with tier, region, payment verification, etc.
 * @returns Deployment response with agent_id, endpoint, and status
 */
export async function deployViaHFSP(req: HFSPDeployRequest): Promise<HFSPDeployResponse> {
  try {
    logger.info({ 
      deployment_id: req.deployment_id,
      tier_id: req.tier_id,
      wallet_address: req.wallet_address,
    }, 'Deploying via HFSP');
    const { url, key } = getHFSPConfig();

    const response = await axios.post(
      `${url}/api/v1/agents/deploy`,
      {
        deployment_id: req.deployment_id,
        tier_id: req.tier_id,
        region: req.region,
        capability_bundle: req.capability_bundle,
        payment_verified: req.payment_verified,
        wallet_address: req.wallet_address,
        telegram_token: req.telegram_token,
        llm_provider: req.llm_provider || 'anthropic',
        llm_api_key: req.llm_api_key,
        config: req.config || {},
      },
      {
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        timeout: 120000,
      }
    );

    const { agent_id, endpoint, status, error } = response.data;
    
    if (error) {
      throw new Error(error);
    }

    logger.info(
      { deployment_id: req.deployment_id, agent_id, endpoint, status },
      'HFSP deployment successful'
    );

    return { 
      agent_id, 
      endpoint, 
      status: status || 'provisioning', 
      error: null 
    };
  } catch (error) {
    logger.error({ deployment_id: req.deployment_id, error: error instanceof Error ? error.message : String(error) }, 'HFSP deployment failed');
    
    if (axios.isAxiosError(error)) {
      if (error.response) {
        return { 
          agent_id: '', 
          endpoint: '', 
          status: 'error', 
          error: `HFSP error: ${error.response.data?.error || error.response.statusText}` 
        };
      } else if (error.request) {
        return { 
          agent_id: '', 
          endpoint: '', 
          status: 'error', 
          error: 'HFSP not responding. Is the service running?' 
        };
      }
    }
    
    return { 
      agent_id: '', 
      endpoint: '', 
      status: 'error', 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}

/**
 * Clawdrop-specific: Get deployment status from HFSP
 * 
 * Polls HFSP for the actual status of a deployed agent.
 * Used to track provisioning progress and agent health.
 * 
 * @param agent_id - The agent ID returned from deployViaHFSP
 * @returns Agent status info from HFSP
 */
export async function getHFSPStatus(agent_id: string): Promise<Partial<AgentStatusInfo> & { error?: string }> {
  try {
    logger.info({ agent_id }, 'Getting HFSP status');
    const { url, key } = getHFSPConfig();

    const response = await axios.get(
      `${url}/api/v1/agents/${agent_id}`,
      {
        headers: { Authorization: `Bearer ${key}` },
        timeout: 10000,
      }
    );

    const { status, logs, uptime_seconds, health, error } = response.data;
    
    if (error) {
      return { agent_id, status: 'error', error };
    }

    logger.info({ agent_id, status }, 'HFSP status retrieved');
    
    return {
      agent_id,
      status: status || 'unknown',
      uptime_seconds: uptime_seconds || 0,
      logs: logs || [],
      health: health,
    };
  } catch (error) {
    logger.error({ agent_id, error: error instanceof Error ? error.message : String(error) }, 'HFSP status check failed');
    
    return { 
      agent_id, 
      status: 'error', 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}

/**
 * Stop a running agent via HFSP.
 * Used by subscription enforcer and cancel_subscription flow.
 * 
 * POSTs to /api/v1/agents/:agent_id/stop with Bearer auth.
 * If HFSP is unreachable, logs the error but does NOT throw —
 * the caller is responsible for updating local state regardless.
 *
 * @param agent_id - The agent ID to stop
 */
export async function stopViaHFSP(agent_id: string): Promise<void> {
  try {
    logger.info({ agent_id }, 'Stopping agent via HFSP');
    const { url, key } = getHFSPConfig();

    await axios.post(
      `${url}/api/v1/agents/${agent_id}/stop`,
      {},
      {
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    logger.info({ agent_id }, 'Agent stopped via HFSP');
  } catch (error) {
    // Log but do not throw — local state update must still proceed
    logger.error(
      { agent_id, error: error instanceof Error ? error.message : String(error) },
      'stopViaHFSP failed — HFSP may be unreachable; continuing with local state update'
    );
  }
}

/**
 * Restart a stopped agent via HFSP.
 * POSTs to /api/v1/agents/:agent_id/restart
 */
export async function restartViaHFSP(agent_id: string): Promise<void> {
  try {
    const { url, key } = getHFSPConfig();
    await axios.post(
      `${url}/api/v1/agents/${agent_id}/restart`,
      {},
      {
        headers: { Authorization: `Bearer ${key}` },
        timeout: 30_000,
      }
    );
    logger.info({ agent_id }, 'restartViaHFSP succeeded');
  } catch (err) {
    logger.warn({ agent_id, err }, 'restartViaHFSP failed — HFSP may be unreachable');
    throw err; // Re-throw so caller knows restart failed
  }
}
