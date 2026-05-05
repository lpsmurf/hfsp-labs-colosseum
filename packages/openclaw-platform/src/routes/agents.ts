import { Router } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { deployStarter, stopAgent, getAgentStatus } from '../services/docker-deployer.js';
import { encrypt } from '../services/key-vault.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET ?? '';

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
  });

  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Invalid request', details: parse.error.format() });

  const { name, llm_provider, llm_model, api_key, custom_endpoint } = parse.data;

  try {
    // Require active subscription
    const sub = db()
      .prepare("SELECT 1 FROM subscriptions WHERE user_id = ? AND status = 'active'")
      .get(userId);
    if (!sub) return res.status(403).json({ error: 'Active subscription required' });

    // Require active subscription — only one active agent per user for Starter tier
    const existing = db()
      .prepare("SELECT id FROM agents WHERE user_id = ? AND status IN ('active', 'deploying')")
      .get(userId);
    if (existing) return res.status(409).json({ error: 'An agent is already running. Stop it first.' });

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

    // Create agent record
    const agentId = uuidv4();
    db().prepare(`
      INSERT INTO agents (id, user_id, name, status, deploy_type, llm_provider, llm_model, custom_endpoint)
      VALUES (?, ?, ?, 'deploying', 'docker', ?, ?, ?)
    `).run(agentId, userId, name, llm_provider, llm_model ?? null, custom_endpoint ?? null);

    const agent = db().prepare('SELECT * FROM agents WHERE id = ?').get(agentId);
    // Respond immediately — deploy runs in background
    res.json({ success: true, agent });

    // Async deploy (do not await in response path)
    void (async () => {
      try {
        const heliusKey = process.env.HELIUS_API_KEY ?? '';
        const result = await deployStarter({
          userId,
          heliusApiKey: heliusKey,
          llmProvider: llm_provider,
          llmModel: llm_model,
          llmApiKey: api_key,
          customEndpoint: custom_endpoint,
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

export default router;
