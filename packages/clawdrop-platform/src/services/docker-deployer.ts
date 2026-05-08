import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';

const execFile = promisify(execFileCb);

async function docker(args: string[]): Promise<string> {
  const { stdout } = await execFile('docker', args, {
    timeout: 60_000,
    maxBuffer: 1024 * 1024,
  });
  return stdout;
}

function dockerName(prefix: string, userId: string): string {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(userId)) {
    throw new Error('Invalid Docker user id suffix');
  }
  return `${prefix}-${userId}`;
}

function envArgs(env: Record<string, string | undefined>): string[] {
  return Object.entries(env)
    .filter(([, value]) => value !== undefined && value !== '')
    .flatMap(([key, value]) => ['-e', `${key}=${value}`]);
}

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
  agentId: string;
  userId: string;
  heliusApiKey: string;
  llmProvider: 'poly' | 'byok' | 'custom';
  llmModel?: string;
  llmApiKey?: string;
  customEndpoint?: string;
  telegramBotToken?: string;
}

export async function deployStarter(config: AgentConfig): Promise<DeployResult> {
  // TODO (Kimi): implement full Docker deploy
  // For now: scaffold with clear steps

  const { userId } = config;
  const mcpPort = allocatePort();
  const agentPort = allocatePort();
  const network = dockerName('user', userId);
  const mcpName = dockerName('mcp', userId);
  const agentName = dockerName('agent', userId);

  // 1. Create isolated Docker network
  await docker(['network', 'create', network]).catch(() => {
    // Network may already exist — ignore
  });

  // 2. Start MCP server container
  const mcpId = await docker([
    'run',
    '-d',
    '--name',
    mcpName,
    '--network',
    network,
    '-p',
    `${mcpPort}:3002`,
    ...envArgs({
      USER_ID: userId,
      HELIUS_API_KEY: config.heliusApiKey,
      LLM_API_KEY: config.llmApiKey,
    }),
    'clawdrop/mcp-server:latest',
  ]);

  // 3. Start autonomous agent container
  const agentId = await docker([
    'run',
    '-d',
    '--name',
    agentName,
    '--network',
    network,
    '-p',
    `${agentPort}:3999`,
    ...envArgs({
      MCP_URL: `http://${mcpName}:3002`,
      USER_ID: userId,
      LLM_PROVIDER: config.llmProvider,
      LLM_MODEL: config.llmModel,
      LLM_API_KEY: config.llmApiKey,
      CUSTOM_ENDPOINT: config.customEndpoint,
      TELEGRAM_BOT_TOKEN: config.telegramBotToken,
      AGENT_ID: config.agentId,
      PLATFORM_URL: process.env.OPENCLAW_PLATFORM_URL ?? 'http://host.docker.internal:8788',
    }),
    'openclaw/agent-runtime:latest',
  ]);

  return {
    mcpPort,
    agentPort,
    mcpContainerId: mcpId.trim(),
    agentContainerId: agentId.trim(),
  };
}

export async function stopAgent(userId: string): Promise<void> {
  const mcpName = dockerName('mcp', userId);
  const agentName = dockerName('agent', userId);
  const network = dockerName('user', userId);
  await docker(['stop', mcpName, agentName]).catch(() => {});
  await docker(['rm', mcpName, agentName]).catch(() => {});
  await docker(['network', 'rm', network]).catch(() => {});
}

export async function getAgentStatus(userId: string): Promise<'running' | 'stopped' | 'unknown'> {
  try {
    const agentName = dockerName('agent', userId);
    const stdout = await docker(['inspect', "--format={{.State.Status}}", agentName]);
    return stdout.trim() === 'running' ? 'running' : 'stopped';
  } catch {
    return 'unknown';
  }
}
