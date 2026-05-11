import { Router } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { deployStarter, stopAgent, getAgentStatus } from '../services/docker-deployer.js';
import { encrypt } from '../services/key-vault.js';
import { verifyPayment } from '../services/payment-verifier.js';
import { createUserKey } from '../services/openrouter-provisioner.js';
import axios from 'axios';
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

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET ?? '';

const DEV_WALLETS = new Set(
  (process.env.DEV_WALLETS ?? '').split(',').map(w => w.trim()).filter(Boolean)
);

function getWalletFromToken(req: { headers: { authorization?: string } }): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(auth.slice(7), JWT_SECRET) as { sub: string; wallet?: string };
    return decoded.wallet ?? null;
  } catch { return null; }
}

function isDevWallet(req: { headers: { authorization?: string } }): boolean {
  const wallet = getWalletFromToken(req);
  return wallet !== null && DEV_WALLETS.has(wallet);
}

function getUserId(req: { headers: { authorization?: string } }): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(auth.slice(7), JWT_SECRET) as { sub: string };
    return decoded.sub;
  } catch {
    return null;
  }
}

// GET /api/agents — list agents with live Docker status
router.get('/', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const agents = db()
      .prepare('SELECT * FROM agents WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as Record<string, unknown>[];

    // Sync live Docker status for active/deploying agents
    const enriched = await Promise.all(
      agents.map(async (agent) => {
        const status = agent.status as string;
        if (status === 'active' || status === 'deploying') {
          const live = await getAgentStatus(userId);
          if (live === 'stopped' && status === 'active') {
            db().prepare("UPDATE agents SET status = 'stopped' WHERE id = ?").run(agent.id);
            return { ...agent, status: 'stopped' };
          }
        }
        return agent;
      })
    );

    res.json({ agents: enriched });
  } catch (err) {
    console.error('[agents/list]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/agents/:id — single agent
router.get('/:id', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const agent = db()
    .prepare('SELECT * FROM agents WHERE id = ? AND user_id = ?')
    .get(req.params.id, userId) as Record<string, unknown> | undefined;

  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json({ agent });
});

// POST /api/agents/deploy — deploy new Docker agent
router.post('/deploy', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const schema = z.object({
    name: z.string().min(1).max(64),
    llm_provider: z.enum(['poly', 'byok', 'custom']),
    llm_model: z.string().optional(),
    provider_name: z.string().optional(),
    api_key: z.string().optional(),
    custom_endpoint: z.string().url().optional(),
    telegram_bot_token: z.string().regex(/^\d+:[A-Za-z0-9_-]{35,}$/, 'Invalid bot token format'),
  });

  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Invalid request', details: parse.error.format() });

  const { name, llm_provider, llm_model, api_key, custom_endpoint, telegram_bot_token } = parse.data;

  try {
    // Require active subscription (skipped for dev wallets)
    if (!isDevWallet(req)) {
      const sub = db()
        .prepare("SELECT 1 FROM subscriptions WHERE user_id = ? AND status = 'active'")
        .get(userId);
      if (!sub) return res.status(403).json({ error: 'Active subscription required' });

      // Only one active agent per user for Starter tier (skipped for dev wallets)
      const existing = db()
        .prepare("SELECT id FROM agents WHERE user_id = ? AND status IN ('active', 'deploying')")
        .get(userId);
      if (existing) return res.status(409).json({ error: 'An agent is already running. Stop it first.' });
    }

    // Store BYOK api key encrypted
    let encryptedKey: string | undefined;
    let encryptedIv: string | undefined;
    if (api_key) {
      const vault = encrypt(api_key);
      encryptedKey = vault.encrypted;
      encryptedIv = vault.iv;
      // Persist to api_keys table
      db().prepare(`
        INSERT INTO api_keys (id, user_id, provider, encrypted_key, iv)
        VALUES (?, ?, ?, ?, ?)
      `).run(uuidv4(), userId, parse.data.provider_name ?? 'unknown', encryptedKey, encryptedIv);
    }

    // Store Telegram bot token encrypted
    const tgVault = encrypt(telegram_bot_token);
    db().prepare(`
      INSERT INTO api_keys (id, user_id, provider, encrypted_key, iv)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), userId, 'telegram', tgVault.encrypted, tgVault.iv);

    // Create agent record
    const agentId = uuidv4();
    db().prepare(`
      INSERT INTO agents (id, user_id, name, status, deploy_type, llm_provider, llm_model, custom_endpoint)
      VALUES (?, ?, ?, 'deploying', 'docker', ?, ?, ?)
    `).run(agentId, userId, name, llm_provider, llm_model ?? null, custom_endpoint ?? null);

    const agent = db().prepare('SELECT * FROM agents WHERE id = ?').get(agentId);

    // Generate Telegram pair code and deeplink before responding
    const pairCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    db().prepare(`
      INSERT INTO telegram_pairings (id, agent_id, pair_code, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(uuidv4(), agentId, pairCode, expiresAt);

    let botHandle = telegram_bot_token.split(':')[0];
    try {
      const getMeRes = await axios.get(
        `https://api.telegram.org/bot${telegram_bot_token}/getMe`,
        { timeout: 5000 }
      );
      botHandle = getMeRes.data?.result?.username ?? botHandle;
    } catch { /* fallback to numeric ID */ }

    const telegramDeeplink = `https://t.me/${botHandle}?start=${pairCode}`;

    // Respond immediately — deploy runs in background
    res.json({ success: true, agent, telegram_deeplink: telegramDeeplink, pair_code: pairCode });

    // Async deploy (do not await in response path)
    void (async () => {
      try {
        const heliusKey = process.env.HELIUS_API_KEY ?? '';
        const result = await deployStarter({
          agentId,
          userId,
          heliusApiKey: heliusKey,
          llmProvider: llm_provider,
          llmModel: llm_model,
          llmApiKey: llm_provider === 'poly' ? process.env.POLY_OPENROUTER_KEY : api_key,
          customEndpoint: custom_endpoint,
          telegramBotToken: telegram_bot_token,
        });
        db().prepare(`
          UPDATE agents
          SET status = 'active', mcp_port = ?, agent_port = ?, container_id = ?
          WHERE id = ?
        `).run(result.mcpPort, result.agentPort, result.agentContainerId, agentId);
        console.log(`[agents/deploy] agent ${agentId} active on ports ${result.mcpPort}/${result.agentPort}`);
      } catch (deployErr) {
        console.error(`[agents/deploy] deploy failed for agent ${agentId}:`, deployErr);
        db().prepare("UPDATE agents SET status = 'failed' WHERE id = ?").run(agentId);
      }
    })();
  } catch (err) {
    console.error('[agents/deploy]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/agents/:id — stop + remove agent
router.delete('/:id', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const agent = db()
    .prepare('SELECT * FROM agents WHERE id = ? AND user_id = ?')
    .get(req.params.id, userId) as { id: string; status: string } | undefined;

  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  try {
    db().prepare("UPDATE agents SET status = 'stopped' WHERE id = ?").run(agent.id);
    res.json({ success: true, message: 'Agent stopped' });

    // Async container cleanup
    void stopAgent(userId).catch((err) =>
      console.error(`[agents/delete] container cleanup failed:`, err)
    );
  } catch (err) {
    console.error('[agents/delete]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
    const merged = deepMerge(current, parse.data) as Record<string, any>;

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

// POST /api/agents/quick-deploy — one-click deploy after payment
router.post('/quick-deploy', async (req, res) => {
  const bodySchema = z.object({
    wallet: z.string().min(32).max(44),
    tx_hash: z.string().min(1),
    tier: z.enum(['free_trial', 'starter']),
    telegram_bot_token: z.string().regex(/^\d+:[A-Za-z0-9_-]{35,}$/, 'Invalid bot token format'),
    llm_provider: z.enum(['poly', 'byok', 'custom']).optional().default('poly'),
    llm_model: z.string().optional(),
    llm_api_key: z.string().optional(),
  });

  const parse = bodySchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid request', details: parse.error.format() });
  }

  const { wallet, tx_hash, tier, telegram_bot_token, llm_provider, llm_model, llm_api_key } = parse.data;
  const userId = wallet; // Use wallet as user identifier

  try {
    // 0. Upsert user row — wallet is the identity for quick-deploy
    db().prepare(`
      INSERT OR IGNORE INTO users (id, wallet_address, tier)
      VALUES (?, ?, 'starter')
    `).run(userId, wallet);

    // 1. Verify payment on-chain (skipped for dev wallets)
    let verification: { valid: boolean; amount: string; error?: string } = { valid: true, amount: '0' };
    if (!DEV_WALLETS.has(wallet)) {
      verification = await verifyPayment(tx_hash, tier, 'SOL');
      if (!verification.valid) {
        return res.status(402).json({ error: 'Payment verification failed', details: verification.error });
      }
    }

    // 2. Convert SOL paid → USD via CoinGecko
    let solPriceUsd = 150;
    try {
      const cg = await axios.get(
        'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
        { timeout: 8000 }
      );
      solPriceUsd = cg.data?.solana?.usd ?? 150;
    } catch {
      solPriceUsd = 150;
    }

    const solPaid = parseFloat(verification.amount) || 0;
    const creditsUsd = Math.max(1, parseFloat((solPaid * solPriceUsd).toFixed(2)));

    // 3. Create OpenRouter child key (Poly mode) or use BYOK key
    let childKey: string | undefined;
    if (llm_provider === 'poly') {
      const or = await createUserKey(userId, creditsUsd);
      childKey = or.key;
    } else if (llm_api_key) {
      childKey = llm_api_key;
    }

    // 4. Encrypt and store Telegram bot token
    const tokenVault = encrypt(telegram_bot_token);
    db().prepare(`
      INSERT INTO api_keys (id, user_id, provider, encrypted_key, iv)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), userId, 'telegram', tokenVault.encrypted, tokenVault.iv);

    // 5. Deploy container
    const agentId = uuidv4();
    const resolvedModel = llm_model ?? (llm_provider === 'poly' ? 'anthropic/claude-haiku-4.5' : undefined);
    db().prepare(`
      INSERT INTO agents (id, user_id, name, status, deploy_type, llm_provider, llm_model)
      VALUES (?, ?, ?, 'deploying', 'docker', ?, ?)
    `).run(agentId, userId, `${llm_provider}-${tier}`, llm_provider, resolvedModel);

    // 6. Pre-generate pair code so deeplink is available immediately
    const pairCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    db().prepare(`
      INSERT INTO telegram_pairings (id, agent_id, pair_code, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(uuidv4(), agentId, pairCode, expiresAt);

    // Resolve bot @username via Telegram getMe (numeric ID alone won't work as deeplink)
    let botHandle = telegram_bot_token.split(':')[0];
    try {
      const getMeRes = await axios.get(
        `https://api.telegram.org/bot${telegram_bot_token}/getMe`,
        { timeout: 5000 }
      );
      botHandle = getMeRes.data?.result?.username ?? botHandle;
    } catch {
      // fallback to numeric ID (deeplink may not work, but we don't block deploy)
    }
    res.status(202).json({
      success: true,
      agent_id: agentId,
      credits_usd: creditsUsd,
      status: 'deploying',
      telegram_deeplink: `https://t.me/${botHandle}?start=${pairCode}`,
      pair_code: pairCode,
    });

    // Async deploy
    void (async () => {
      try {
        const result = await deployStarter({
          agentId,
          userId,
          heliusApiKey: process.env.HELIUS_API_KEY ?? '',
          llmProvider: llm_provider,
          llmModel: resolvedModel,
          llmApiKey: childKey,
          telegramBotToken: telegram_bot_token,
        });

        db().prepare(`
          UPDATE agents
          SET status = 'active', mcp_port = ?, agent_port = ?, container_id = ?
          WHERE id = ?
        `).run(result.mcpPort, result.agentPort, result.agentContainerId, agentId);

        console.log(`[agents/quick-deploy] agent ${agentId} active, pair_code ${pairCode}`);
      } catch (deployErr) {
        console.error(`[agents/quick-deploy] deploy failed for agent ${agentId}:`, deployErr);
        db().prepare("UPDATE agents SET status = 'failed' WHERE id = ?").run(agentId);
      }
    })();
  } catch (err) {
    console.error('[agents/quick-deploy]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/agents/:id/telegram — fetch Telegram pairing for an agent
// Auth: X-Agent-Id header must match the agent ID (inter-service)
router.get('/:id/telegram', (req, res) => {
  const agentId = req.params.id;
  if (req.headers['x-agent-id'] !== agentId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const pairing = db().prepare(
      'SELECT chat_id, pair_code, expires_at, paired_at FROM telegram_pairings WHERE agent_id = ?'
    ).get(agentId) as Record<string, unknown> | undefined;

    res.json({ pairing: pairing ?? null });
  } catch (err) {
    console.error('[agents/telegram]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/agents/:id/pair — pair a Telegram chat with an agent
router.patch('/:id/pair', async (req, res) => {
  const bodySchema = z.object({
    pair_code: z.string().min(1),
    chat_id: z.number().int(),
  });

  const parse = bodySchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid request', details: parse.error.format() });
  }

  const { pair_code, chat_id } = parse.data;

  try {
    // Allow pairing if:
    // 1. Code is unused (chat_id IS NULL), OR
    // 2. Code is already paired to the SAME chat (re-pair after agent restart)
    const row = db().prepare(
      "SELECT * FROM telegram_pairings WHERE agent_id = ? AND pair_code = ? AND expires_at > datetime('now') AND (chat_id IS NULL OR chat_id = ?)"
    ).get(req.params.id, pair_code, chat_id) as Record<string, unknown> | undefined;

    if (!row) {
      return res.status(404).json({ error: 'Invalid or expired pair code' });
    }

    db().prepare("UPDATE telegram_pairings SET chat_id = ?, paired_at = datetime('now') WHERE id = ?")
      .run(chat_id, row.id);

    res.json({ success: true, chat_id });
  } catch (err) {
    console.error('[agents/pair]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
