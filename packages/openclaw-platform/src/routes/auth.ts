import { Router } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { PublicKey } from '@solana/web3.js';
import { ed25519 } from '@noble/curves/ed25519';
import { db } from '../db/index.js';

const router = Router();
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

const JWT_SECRET = process.env.JWT_SECRET ?? '';
if (!JWT_SECRET) {
  console.error('JWT_SECRET not set');
  process.exit(1);
}

function decodeSignature(signature: string): Uint8Array | null {
  if (/^[0-9a-fA-F]{128}$/.test(signature)) {
    return Uint8Array.from(Buffer.from(signature, 'hex'));
  }

  try {
    const decoded = Uint8Array.from(Buffer.from(signature, 'base64'));
    return decoded.length === 64 ? decoded : null;
  } catch {
    return null;
  }
}

function verifyWalletSignature(walletAddress: string, signature: string, message: string): boolean {
  if (!message.startsWith('Sign in to Openclaw')) return false;

  const signatureBytes = decodeSignature(signature);
  if (!signatureBytes) return false;

  try {
    const publicKey = new PublicKey(walletAddress);
    const messageBytes = new TextEncoder().encode(message);
    return ed25519.verify(signatureBytes, messageBytes, publicKey.toBytes());
  } catch {
    return false;
  }
}

/**
 * POST /api/auth/login
 * Wallet-based JWT auth
 *
 * Body: { wallet_address: string, signature: string, message: string }
 * Response: { token: string, user: object }
 */
router.post('/login', async (req, res) => {
  const schema = z.object({
    wallet_address: z.string().min(32).max(44).optional(),
    walletAddress: z.string().min(32).max(44).optional(),
    signature: z.string().min(64).max(128),
    message: z.string().min(1).max(512),
  });

  const parse = schema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid request', details: parse.error.format() });
  }

  const wallet_address = parse.data.wallet_address ?? parse.data.walletAddress;
  if (!wallet_address) {
    return res.status(400).json({ error: 'wallet_address is required' });
  }

  if (!verifyWalletSignature(wallet_address, parse.data.signature, parse.data.message)) {
    return res.status(401).json({ error: 'Invalid wallet signature' });
  }

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
      { expiresIn: TOKEN_TTL_SECONDS }
    );

    res.json({ token, expires_in: TOKEN_TTL_SECONDS, user });
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
