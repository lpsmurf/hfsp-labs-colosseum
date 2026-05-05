import { exec as execCb } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execCb);

// Port range for dynamic allocation
let nextPort = 10000;
function allocatePort(): number {
  return nextPort++;
}

export interface DeployResult {
  mcpPort: number;
  agentPort: number;
  mcpContainerId: string;
  agentContainerId: string;
}

export interface AgentConfig {
  userId: string;
  heliusApiKey: string;
  llmProvider: 'poly' | 'byok' | 'custom';
  llmModel?: string;
  llmApiKey?: string;
  customEndpoint?: string;
}

export async function deployStarter(config: AgentConfig): Promise<DeployResult> {
  // TODO (Kimi): implement full Docker deploy
  // For now: scaffold with clear steps

  const { userId } = config;
  const mcpPort = allocatePort();
  const agentPort = allocatePort();
  const network = `user-${userId}`;

  // 1. Create isolated Docker network
  await exec(`docker network create ${network}`).catch(() => {
    // Network may already exist — ignore
  });

  // 2. Start MCP server container
  const mcpEnv = [
    `-e USER_ID=${userId}`,
    `-e HELIUS_API_KEY=${config.heliusApiKey}`,
    config.llmApiKey ? `-e LLM_API_KEY=${config.llmApiKey}` : '',
  ].filter(Boolean).join(' ');

  const { stdout: mcpId } = await exec(
    `docker run -d --name mcp-${userId} --network ${network} -p ${mcpPort}:3002 ${mcpEnv} openclaw/mcp-server:latest`
  );

  // 3. Start autonomous agent container
  const agentEnv = [
    `-e MCP_URL=http://mcp-${userId}:3002`,
    `-e USER_ID=${userId}`,
    `-e LLM_PROVIDER=${config.llmProvider}`,
    config.llmModel ? `-e LLM_MODEL=${config.llmModel}` : '',
    config.customEndpoint ? `-e CUSTOM_ENDPOINT=${config.customEndpoint}` : '',
  ].filter(Boolean).join(' ');

  const { stdout: agentId } = await exec(
    `docker run -d --name agent-${userId} --network ${network} -p ${agentPort}:3999 ${agentEnv} openclaw/agent-runtime:latest`
  );

  return {
    mcpPort,
    agentPort,
    mcpContainerId: mcpId.trim(),
    agentContainerId: agentId.trim(),
  };
}

export async function stopAgent(userId: string): Promise<void> {
  await exec(`docker stop mcp-${userId} agent-${userId}`).catch(() => {});
  await exec(`docker rm mcp-${userId} agent-${userId}`).catch(() => {});
  await exec(`docker network rm user-${userId}`).catch(() => {});
}

export async function getAgentStatus(userId: string): Promise<'running' | 'stopped' | 'unknown'> {
  try {
    const { stdout } = await exec(`docker inspect --format='{{.State.Status}}' agent-${userId}`);
    return stdout.trim() === 'running' ? 'running' : 'stopped';
  } catch {
    return 'unknown';
  }
}
