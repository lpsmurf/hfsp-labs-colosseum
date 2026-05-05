import { Router } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';

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

/**
 * GET /api/agents
 * List user's agents + live status
 */
router.get('/', (req, res) => {
  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const agents = db()
      .prepare('SELECT * FROM agents WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as Record<string, unknown>[];

    res.json({ agents });
  } catch (err) {
    console.error('[agents/list] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/agents/deploy
 * Deploy a new agent (Starter tier = Docker)
 */
router.post('/deploy', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const schema = z.object({
    name: z.string().min(1).max(64),
    llm_provider: z.enum(['poly', 'byok', 'custom']),
    llm_model: z.string().optional(),
    custom_endpoint: z.string().url().optional(),
  });

  const parse = schema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid request', details: parse.error.format() });
  }

  const { name, llm_provider, llm_model, custom_endpoint } = parse.data;

  try {
    // Check subscription
    const sub = db()
      .prepare("SELECT 1 FROM subscriptions WHERE user_id = ? AND status = 'active'")
      .get(userId) as { 1: number } | undefined;

    if (!sub) {
      return res.status(403).json({ error: 'Active subscription required' });
    }

    // Create agent record
    const agentId = uuidv4();
    db().prepare(`
      INSERT INTO agents (id, user_id, name, status, deploy_type, llm_provider, llm_model, custom_endpoint)
      VALUES (?, ?, ?, 'deploying', 'docker', ?, ?, ?)
    `).run(agentId, userId, name, llm_provider, llm_model ?? null, custom_endpoint ?? null);

    const agent = db()
      .prepare('SELECT * FROM agents WHERE id = ?')
      .get(agentId);

    // TODO: Trigger actual Docker deployment (docker-deployer.ts)
    // For now, mark as deployed stub
    db().prepare("UPDATE agents SET status = 'active' WHERE id = ?").run(agentId);

    res.json({ success: true, agent });
  } catch (err) {
    console.error('[agents/deploy] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/agents/:id
 * Stop + remove agent
 */
router.delete('/:id', (req, res) => {
  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id } = req.params;

  try {
    const agent = db()
      .prepare('SELECT * FROM agents WHERE id = ? AND user_id = ?')
      .get(id, userId) as { id: string; container_id?: string } | undefined;

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // TODO: Stop Docker container (docker-deployer.ts)
    db().prepare("UPDATE agents SET status = 'stopped' WHERE id = ?").run(id);

    res.json({ success: true, message: 'Agent stopped' });
  } catch (err) {
    console.error('[agents/delete] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
