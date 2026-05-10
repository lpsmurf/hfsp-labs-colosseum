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
    .filter(([, v]) => v !== undefined && v !== '')
    .flatMap(([k, v]) => ['-e', `${k}=${v}`]);
}

let nextPort = 10000;
function allocatePort(): number {
  return nextPort++;
}

// Write a single file into a named Docker volume via a one-shot Alpine container.
// Uses base64 to safely handle all content including newlines and special chars.
async function writeToVolume(volume: string, path: string, content: string): Promise<void> {
  const b64 = Buffer.from(content, 'utf8').toString('base64');
  await docker([
    'run', '--rm',
    '-v', `${volume}:/vol`,
    '-e', `CONTENT=${b64}`,
    'alpine:3.20',
    'sh', '-c', `printf '%s' "$CONTENT" | base64 -d > "/vol/${path}"`,
  ]);
}

async function mkdirInVolume(volume: string, dir: string): Promise<void> {
  await docker([
    'run', '--rm',
    '-v', `${volume}:/vol`,
    'alpine:3.20',
    'sh', '-c', `mkdir -p "/vol/${dir}"`,
  ]);
}

// --- openclaw.json template ---

function buildConfig(mcpContainerName: string, llmModel: string): string {
  return JSON.stringify({
    identity: { name: 'Solana Agent', emoji: '🤖' },
    gateway: { port: 3000 },
    workspace: { path: '/tenant/workspace', skipBootstrap: true },
    channels: {
      telegram: {
        botToken: '${TELEGRAM_BOT_TOKEN}',
        dmPolicy: 'pairing',
      },
    },
    mcp: {
      servers: [
        {
          name: 'solana',
          transport: 'streamable-http',
          url: `http://${mcpContainerName}:3002/mcp`,
        },
      ],
    },
    agents: {
      defaults: {
        model: { primary: llmModel },
        heartbeat: { enabled: true, intervalSeconds: 3600 },
      },
    },
  }, null, 2);
}

// --- Workspace file templates ---

const SOUL_MD = `You are a 24/7 autonomous Solana AI agent. Your purpose is to help your user navigate the Solana ecosystem — tracking their portfolio, monitoring prices, analyzing tokens, and executing DeFi strategies when instructed.

You are curious, proactive, and deeply knowledgeable about Solana DeFi. You communicate clearly and concisely. You never reveal API keys, private keys, or internal configuration details.`;

const AGENTS_MD = `# Capabilities

You have access to real-time Solana blockchain data and DeFi tools via MCP:

- Check SOL and token prices
- Analyze wallet portfolios and token holdings
- Monitor Solana transactions
- Check token safety (rug detection)
- Get DeFi market overview
- Execute trades via Jupiter DEX

Always ask for confirmation before executing any transaction that moves funds.`;

const HEARTBEAT_MD = `# Heartbeat

On each heartbeat:
- Check if the user has set any active price alerts
- Monitor significant market movements relevant to the user's holdings
- Keep messages brief and actionable — do not spam`;

const MEMORY_MD = `# Memory

No memories yet. This file is updated automatically as the agent learns about the user.`;

const IDENTITY_MD = `# Identity

I am a Solana AI Agent powered by Openclaw. I am private, always-on, and belong only to my user.`;

// --- Public interface ---

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
  llmApiKey?: string;       // OpenRouter child key for poly; user's own key for byok
  customEndpoint?: string;
  telegramBotToken?: string;
}

export async function deployStarter(config: AgentConfig): Promise<DeployResult> {
  const { userId } = config;
  const mcpPort   = allocatePort();
  const agentPort = allocatePort();
  const network   = dockerName('user', userId);
  const mcpName   = dockerName('mcp', userId);
  const agentName = dockerName('agent', userId);
  const configVol = `openclaw-config-${userId}`;
  const wsVol     = `openclaw-workspace-${userId}`;

  // 1. Isolated network
  await docker(['network', 'create', network]).catch(() => {});

  // 2. Named volumes (survive container restarts — agent memory persists)
  await docker(['volume', 'create', configVol]).catch(() => {});
  await docker(['volume', 'create', wsVol]).catch(() => {});

  // 3. Write openclaw.json into config volume
  const model = config.llmModel ?? 'openrouter/anthropic/claude-haiku-4-5';
  const openclawJson = buildConfig(mcpName, model);
  await writeToVolume(configVol, 'openclaw.json', openclawJson);

  // 4. Write OpenRouter child key into secrets/
  await mkdirInVolume(configVol, 'secrets');
  if (config.llmApiKey) {
    await writeToVolume(configVol, 'secrets/openrouter.key', config.llmApiKey);
  }

  // 5. Write workspace .md files
  await writeToVolume(wsVol, 'SOUL.md', SOUL_MD);
  await writeToVolume(wsVol, 'AGENTS.md', AGENTS_MD);
  await writeToVolume(wsVol, 'HEARTBEAT.md', HEARTBEAT_MD);
  await writeToVolume(wsVol, 'MEMORY.md', MEMORY_MD);
  await writeToVolume(wsVol, 'IDENTITY.md', IDENTITY_MD);
  await mkdirInVolume(wsVol, 'memory');

  // 6. MCP server (unchanged)
  const mcpId = await docker([
    'run', '-d',
    '--name', mcpName,
    '--network', network,
    '-p', `${mcpPort}:3002`,
    ...envArgs({
      USER_ID: userId,
      HELIUS_API_KEY: config.heliusApiKey,
    }),
    'colosseum-clawdrop-mcp-server:latest',
  ]);

  // 7. OpenClaw gateway (replaces clawdrop-agent-runtime)
  const agentId = await docker([
    'run', '-d',
    '--name', agentName,
    '--network', network,
    '-p', `${agentPort}:3000`,
    '-v', `${configVol}:/home/clawd/.openclaw:ro`,
    '-v', `${wsVol}:/tenant/workspace`,
    ...envArgs({
      TELEGRAM_BOT_TOKEN: config.telegramBotToken,
      OPENROUTER_API_KEY: config.llmApiKey,
    }),
    'colosseum-openclaw-runtime:latest',
  ]);

  return {
    mcpPort,
    agentPort,
    mcpContainerId: mcpId.trim(),
    agentContainerId: agentId.trim(),
  };
}

export async function stopAgent(userId: string): Promise<void> {
  const mcpName   = dockerName('mcp', userId);
  const agentName = dockerName('agent', userId);
  const network   = dockerName('user', userId);
  await docker(['stop', mcpName, agentName]).catch(() => {});
  await docker(['rm', mcpName, agentName]).catch(() => {});
  await docker(['network', 'rm', network]).catch(() => {});
  // Volumes are intentionally kept — agent memory persists across restarts
}

export async function getAgentStatus(userId: string): Promise<'running' | 'stopped' | 'unknown'> {
  try {
    const agentName = dockerName('agent', userId);
    const stdout = await docker(['inspect', '--format={{.State.Status}}', agentName]);
    return stdout.trim() === 'running' ? 'running' : 'stopped';
  } catch {
    return 'unknown';
  }
}
