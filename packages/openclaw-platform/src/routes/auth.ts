import { Router } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET ?? '';
if (!JWT_SECRET) {
  console.error('JWT_SECRET not set');
  process.exit(1);
}

/**
 * POST /api/auth/login
 * Wallet-based JWT auth
 *
 * Body: { wallet_address: string, signature?: string }
 * Response: { token: string, user: object }
 *
 * For MVP: signature verification is deferred. We trust the wallet address
 * from Phantom / wallet adapter. Production should verify the signature.
 */
router.post('/login', async (req, res) => {
  const schema = z.object({
    wallet_address: z.string().min(32).max(44),
    signature: z.string().optional(),
    message: z.string().optional(),
  });

  const parse = schema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid request', details: parse.error.format() });
  }

  const { wallet_address } = parse.data;

  try {
    // Find or create user
    let user = db()
      .prepare('SELECT * FROM users WHERE wallet_address = ?')
      .get(wallet_address) as Record<string, unknown> | undefined;

    if (!user) {
      const id = uuidv4();
      db().prepare(`
        INSERT INTO users (id, wallet_address, tier)
        VALUES (?, ?, 'free')
      `).run(id, wallet_address);

      user = db()
        .prepare('SELECT * FROM users WHERE id = ?')
        .get(id) as Record<string, unknown>;
    }

    // Generate JWT
    const token = jwt.sign(
      { sub: user.id, wallet: wallet_address, tier: user.tier },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user });
  } catch (err) {
    console.error('[auth/login] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/auth/me
 * Get current user from JWT
 */
router.get('/me', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token' });
  }

  const token = auth.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: string };
    const user = db()
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(decoded.sub) as Record<string, unknown> | undefined;

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

export default router;
