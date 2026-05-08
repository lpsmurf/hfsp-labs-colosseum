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
 * GET /api/usage/tokens
 * Get token usage for the current month
 */
router.get('/tokens', (req, res) => {
  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const month = new Date().toISOString().slice(0, 7); // YYYY-MM

    const usage = db()
      .prepare(`
        SELECT
          month,
          SUM(input_tokens) as total_input,
          SUM(output_tokens) as total_output,
          SUM(input_tokens + output_tokens) as total_tokens,
          model
        FROM token_usage
        WHERE user_id = ? AND month = ?
        GROUP BY model
      `)
      .all(userId, month) as Array<Record<string, unknown>>;

    const total = db()
      .prepare(`
        SELECT
          SUM(input_tokens) as total_input,
          SUM(output_tokens) as total_output,
          SUM(input_tokens + output_tokens) as total_tokens
        FROM token_usage
        WHERE user_id = ? AND month = ?
      `)
      .get(userId, month) as { total_input: number; total_output: number; total_tokens: number } | undefined;

    res.json({
      month,
      usage: usage ?? [],
      totals: total ?? { total_input: 0, total_output: 0, total_tokens: 0 },
    });
  } catch (err) {
    console.error('[usage/tokens] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
