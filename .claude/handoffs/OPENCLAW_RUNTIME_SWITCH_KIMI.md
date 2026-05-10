# OpenClaw Runtime Switch — Build Handoff for Kimi

**Handed off:** 2026-05-09
**From:** Claude
**To:** Kimi
**Branch to create:** `kimi/openclaw-runtime-switch`
**Commit prefix:** `[kimi]`
**Do NOT touch:** `packages/trial-api/`, `packages/clawdrop-landing/`, `packages/clawdrop-mcp-server/`, existing DB schema

---

## What you're building

Replace the custom `clawdrop-agent-runtime` container with the real **OpenClaw gateway** for all new agent deployments. The current agent runtime reimplements things OpenClaw provides natively (Telegram bot, LLM routing, tool calling). We're cutting the custom runtime entirely.

**One-line summary:**
> Deploy `colosseum-openclaw-runtime` (OpenClaw gateway) instead of `colosseum-clawdrop-agent-runtime`, wired with per-user named volumes carrying an `openclaw.json` config + workspace `.md` files + OpenRouter child key.

---

## Architecture decisions locked (do not re-litigate)

| # | Decision | Value |
|---|----------|-------|
| 1 | Agent container image | `colosseum-openclaw-runtime:latest` (built from `packages/agent-provisioning/tenant-runtime-image/`) |
| 2 | LLM provider | OpenRouter — native first-class support in OpenClaw |
| 3 | Env var for LLM key | `OPENROUTER_API_KEY` → user's child key from `createUserKey()` |
| 4 | Model ref format | `openrouter/anthropic/claude-haiku-4-5` |
| 5 | Config location inside container | `/home/clawd/.openclaw/openclaw.json` |
| 6 | Secrets location inside container | `/home/clawd/.openclaw/secrets/openrouter.key` |
| 7 | Workspace location inside container | `/tenant/workspace/` |
| 8 | Volume strategy | Named Docker volumes per user — correct for DinD via socket |
| 9 | Telegram pairing | `dmPolicy: "pairing"` — OpenClaw handles it natively, no custom pair code logic needed |
| 10 | Config editability | Guarded merge endpoint — users can patch personality/model, platform enforces locked fields |
| 11 | `skipBootstrap: true` | Must always be set — prevents OpenClaw from overwriting staged `.md` files |
| 12 | Gateway port inside container | `3000` |

---

## Files to change

### 1. `packages/agent-provisioning/tenant-runtime-image/entrypoint.sh` — MODIFY

**Problem:** `su` clears the env. Current entrypoint only forwards `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` to the openclaw process. `OPENROUTER_API_KEY` and `TELEGRAM_BOT_TOKEN` are stripped and never reach openclaw.

**Replace the entire file with:**

```bash
#!/usr/bin/env bash
set -euo pipefail

mkdir -p /tenant/workspace

# Resolve provider keys — env var takes precedence, secrets file is fallback
ANTHROPIC_KEY="${ANTHROPIC_API_KEY:-}"
if [[ -z "$ANTHROPIC_KEY" ]] && [[ -f /home/clawd/.openclaw/secrets/anthropic.key ]]; then
  ANTHROPIC_KEY="$(tr -d '\r\n' < /home/clawd/.openclaw/secrets/anthropic.key)"
fi

OPENAI_KEY="${OPENAI_API_KEY:-}"
if [[ -z "$OPENAI_KEY" ]] && [[ -f /home/clawd/.openclaw/secrets/openai.key ]]; then
  OPENAI_KEY="$(tr -d '\r\n' < /home/clawd/.openclaw/secrets/openai.key)"
fi

OPENROUTER_KEY="${OPENROUTER_API_KEY:-}"
if [[ -z "$OPENROUTER_KEY" ]] && [[ -f /home/clawd/.openclaw/secrets/openrouter.key ]]; then
  OPENROUTER_KEY="$(tr -d '\r\n' < /home/clawd/.openclaw/secrets/openrouter.key)"
fi

TG_TOKEN="${TELEGRAM_BOT_TOKEN:-}"

CMD_PREFIX="HOME=/home/clawd"
[[ -n "$ANTHROPIC_KEY" ]]  && CMD_PREFIX+=" ANTHROPIC_API_KEY=\"$ANTHROPIC_KEY\""
[[ -n "$OPENAI_KEY" ]]     && CMD_PREFIX+=" OPENAI_API_KEY=\"$OPENAI_KEY\""
[[ -n "$OPENROUTER_KEY" ]] && CMD_PREFIX+=" OPENROUTER_API_KEY=\"$OPENROUTER_KEY\""
[[ -n "$TG_TOKEN" ]]       && CMD_PREFIX+=" TELEGRAM_BOT_TOKEN=\"$TG_TOKEN\""

exec su -s /bin/bash -c "$CMD_PREFIX openclaw gateway run --force" clawd
```

---

### 2. `packages/clawdrop-platform/src/services/docker-deployer.ts` — FULL REWRITE

Current file: `packages/clawdrop-platform/src/services/docker-deployer.ts`

**Complete replacement:**

```typescript
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
```

---

### 3. `packages/clawdrop-platform/src/routes/agents.ts` — ADD ONE ENDPOINT

Add `PATCH /api/agents/:id/config` after the existing DELETE endpoint. This lets users edit their agent's personality, model, and heartbeat while the platform enforces locked infrastructure fields.

```typescript
// PATCH /api/agents/:id/config — guarded config update
router.patch('/:id/config', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const agent = db()
    .prepare('SELECT * FROM agents WHERE id = ? AND user_id = ?')
    .get(req.params.id, userId) as Record<string, unknown> | undefined;
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const patchSchema = z.object({
    identity: z.object({
      name:  z.string().min(1).max(64).optional(),
      emoji: z.string().max(4).optional(),
    }).optional(),
    agents: z.object({
      defaults: z.object({
        model: z.object({
          primary: z.string().min(1),
        }).optional(),
        heartbeat: z.object({
          enabled:         z.boolean().optional(),
          intervalSeconds: z.number().int().min(60).max(86400).optional(),
        }).optional(),
      }).optional(),
    }).optional(),
  });

  const parse = patchSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Invalid config patch', details: parse.error.format() });

  try {
    // Read current config from volume via one-shot Alpine container
    const configVol = `openclaw-config-${userId}`;
    const { stdout: rawJson } = await execFile('docker', [
      'run', '--rm',
      '-v', `${configVol}:/vol:ro`,
      'alpine:3.20',
      'sh', '-c', 'cat /vol/openclaw.json',
    ], { timeout: 15_000, maxBuffer: 1024 * 1024 });

    const current = JSON.parse(rawJson);

    // Deep merge user patch
    const merged = deepMerge(current, parse.data);

    // Enforce locked fields — platform always wins on these
    const mcpName = `mcp-${userId}`;
    merged.gateway   = { port: 3000 };
    merged.workspace = { path: '/tenant/workspace', skipBootstrap: true };
    merged.channels  = {
      ...merged.channels,
      telegram: {
        ...(merged.channels?.telegram ?? {}),
        botToken: '${TELEGRAM_BOT_TOKEN}',
        dmPolicy: 'pairing',
      },
    };
    // Ensure user's own MCP server is always first entry
    const userMcpServer = {
      name: 'solana',
      transport: 'streamable-http',
      url: `http://${mcpName}:3002/mcp`,
    };
    const otherServers = (merged.mcp?.servers ?? []).filter(
      (s: { name: string }) => s.name !== 'solana'
    );
    merged.mcp = { servers: [userMcpServer, ...otherServers] };

    // Write merged config back
    const b64 = Buffer.from(JSON.stringify(merged, null, 2), 'utf8').toString('base64');
    await execFile('docker', [
      'run', '--rm',
      '-v', `${configVol}:/vol`,
      '-e', `CONTENT=${b64}`,
      'alpine:3.20',
      'sh', '-c', `printf '%s' "$CONTENT" | base64 -d > /vol/openclaw.json`,
    ], { timeout: 15_000, maxBuffer: 1024 * 1024 });

    res.json({ success: true, config: merged });
  } catch (err) {
    console.error('[agents/config]', err);
    res.status(500).json({ error: 'Failed to update config' });
  }
});
```

Add this helper at the top of `agents.ts` (after imports):

```typescript
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
const execFile = promisify(execFileCb);

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const out = { ...target };
  for (const [k, v] of Object.entries(source)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v) &&
        typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}
```

---

### 4. `docker-compose.trial.yml` — ADD openclaw-runtime image build

Add after the `clawdrop-mcp-server` service — this ensures the image is built before the platform can spawn it:

```yaml
  # OpenClaw tenant runtime image (built here, spawned per-user by clawdrop-platform)
  openclaw-runtime-builder:
    build:
      context: packages/agent-provisioning/tenant-runtime-image
      dockerfile: Dockerfile
    image: colosseum-openclaw-runtime:latest
    command: ["echo", "image built"]
    profiles: ["build-only"]   # never actually runs, just builds the image
```

Or simpler — just add a `Makefile` target or note in the README that the image must be built:

```bash
docker build -t colosseum-openclaw-runtime:latest packages/agent-provisioning/tenant-runtime-image/
```

---

## What you do NOT need to touch

| File | Why |
|------|-----|
| `packages/clawdrop-platform/src/routes/agents.ts` | Only add the new PATCH endpoint — do not modify existing deploy/stop/pair logic |
| `packages/clawdrop-platform/src/services/openrouter-provisioner.ts` | Already correct — `createUserKey()` returns the `sk-or-v1-...` key to pass as `llmApiKey` |
| `packages/clawdrop-platform/src/services/key-vault.ts` | Unchanged |
| `packages/clawdrop-mcp-server/` | Unchanged — already speaks streamable-http at `:3002/mcp` |
| `packages/clawdrop-agent-runtime/` | Leave as-is for now — do not delete (may be needed for rollback) |
| DB schema | No schema changes needed |
| `packages/trial-api/` | Out of scope |
| `packages/clawdrop-landing/` | Out of scope |

---

## How `llmApiKey` flows (trace it before coding)

```
agents.ts POST /quick-deploy
  → createUserKey(userId, creditsUsd)   # openrouter-provisioner.ts
  → returns { key: "sk-or-v1-..." }
  → deployStarter({ ..., llmApiKey: key })
                          │
                          ▼
docker-deployer.ts
  → writeToVolume(configVol, 'secrets/openrouter.key', config.llmApiKey)
  → docker run -e OPENROUTER_API_KEY={config.llmApiKey} colosseum-openclaw-runtime:latest
                          │
                          ▼
entrypoint.sh (inside container)
  → reads OPENROUTER_API_KEY from env (or falls back to secrets/openrouter.key)
  → passes OPENROUTER_API_KEY="sk-or-v1-..." inline to openclaw gateway run
                          │
                          ▼
openclaw reads openclaw.json
  → model.primary = "openrouter/anthropic/claude-haiku-4-5"
  → uses OPENROUTER_API_KEY to authenticate to openrouter.ai
```

---

## Verification steps after implementation

```bash
# 1. Build the OpenClaw runtime image
docker build -t colosseum-openclaw-runtime:latest packages/agent-provisioning/tenant-runtime-image/

# 2. Check TypeScript compiles clean
cd packages/clawdrop-platform && npm run build

# 3. Smoke test deploy (requires TELEGRAM_BOT_TOKEN + OPENROUTER_API_KEY in .env.platform)
curl -X POST http://localhost:8788/api/agents/quick-deploy \
  -H 'Content-Type: application/json' \
  -d '{"wallet":"<wallet>","tx_hash":"<hash>","tier":"starter","telegram_bot_token":"<token>"}'

# 4. Verify containers running
docker ps | grep -E "mcp-|agent-"

# 5. Verify config volume was populated
docker run --rm -v openclaw-config-<userId>:/v alpine cat /v/openclaw.json

# 6. Verify OpenClaw connected to Telegram (check logs)
docker logs agent-<userId> --tail 50
```

---

## Known quirks / watch out for

1. **`su` env stripping** — the entire reason we rewrote the entrypoint. If openclaw can't reach Telegram or OpenRouter, check the entrypoint is forwarding both vars correctly.

2. **Volume write race** — all `writeToVolume` calls must complete before `docker run` for the agent. They're sequential in the current implementation.

3. **`alpine:3.20` must be available** — if not pulled on the host, the first deploy will pull it (~5MB, fast). No action needed.

4. **Port allocation is in-memory** (`nextPort++`) — restarting the platform resets to 10000. If containers from a previous run still exist, port conflicts will occur. For now this is acceptable; a DB-backed port table is a v2 item.

5. **`skipBootstrap: true` is non-negotiable** — if this is missing from the config, OpenClaw overwrites SOUL.md and friends with its defaults.

6. **Volumes are NOT deleted on `stopAgent()`** — this is intentional. Agent memory persists. Only delete volumes when the user explicitly deletes their account.
