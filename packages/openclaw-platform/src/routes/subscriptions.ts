import { Router } from 'express';
import jwt from 'jsonwebtoken';
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
 * GET /api/subscriptions
 * Get the current user's active subscription
 */
router.get('/', (req, res) => {
  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const sub = db()
      .prepare(`
        SELECT s.*, u.wallet_address, u.tier as user_tier
        FROM subscriptions s
        JOIN users u ON u.id = s.user_id
        WHERE s.user_id = ? AND s.status = 'active'
        ORDER BY s.created_at DESC
        LIMIT 1
      `)
      .get(userId) as Record<string, unknown> | undefined;

    if (!sub) {
      return res.status(404).json({ error: 'No active subscription', tier: 'free' });
    }

    res.json({ subscription: sub });
  } catch (err) {
    console.error('[subscriptions] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
