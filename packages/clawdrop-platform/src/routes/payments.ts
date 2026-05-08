import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';
import { verifyPayment, getTierPriceUsd } from '../services/payment-verifier.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET ?? '';

function getAuthUser(req: { headers: { authorization?: string } }): { userId: string; wallet: string } | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(auth.slice(7), JWT_SECRET) as { sub: string; wallet: string };
    return { userId: decoded.sub, wallet: decoded.wallet };
  } catch {
    return null;
  }
}

/**
 * POST /api/payments/verify
 * Verify a Solana payment and create/update subscription
 *
 * Body: { tx_signature: string, tier: string, token: string }
 * Response: { success: boolean, subscription?: object, error?: string }
 */
router.post('/verify', async (req, res) => {
  const schema = z.object({
    tx_signature: z.string().min(1).max(128),
    tier: z.enum(['starter', 'pro']),
    token: z.enum(['SOL', 'USDC', 'USDT', 'HERD']),
    wallet_address: z.string().min(32).max(44), // user's wallet
  });

  const parse = schema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ success: false, error: 'Invalid request', details: parse.error.format() });
  }

  const { tx_signature, tier, token, wallet_address } = parse.data;
  const authUser = getAuthUser(req);
  if (!authUser) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  if (authUser.wallet !== wallet_address) {
    return res.status(403).json({ success: false, error: 'Payment wallet does not match authenticated wallet' });
  }

  try {
    // 1. Verify the payment on-chain
    const verification = await verifyPayment(tx_signature, tier, token);
    if (!verification.valid) {
      return res.status(400).json({ success: false, error: verification.error ?? 'Payment verification failed' });
    }

    // 2. Ensure user exists (or create)
    const existingUser = db()
      .prepare('SELECT id, tier FROM users WHERE wallet_address = ?')
      .get(wallet_address) as { id: string; tier: string } | undefined;

    let userId: string;
    if (existingUser) {
      userId = existingUser.id;
      if (userId !== authUser.userId) {
        return res.status(403).json({ success: false, error: 'Authenticated user does not own this wallet' });
      }
      // Update tier
      db().prepare("UPDATE users SET tier = ?, updated_at = datetime('now') WHERE id = ?")
        .run(tier, userId);
    } else {
      userId = authUser.userId || uuidv4();
      db().prepare(`
        INSERT INTO users (id, wallet_address, tier)
        VALUES (?, ?, ?)
      `).run(userId, wallet_address, tier);
    }

    // 3. Check for existing active subscription
    const existingSub = db()
      .prepare("SELECT id FROM subscriptions WHERE user_id = ? AND status = 'active'")
      .get(userId) as { id: string } | undefined;

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);

    let subscriptionId: string;
    if (existingSub) {
      // Extend existing subscription
      subscriptionId = existingSub.id;
      db().prepare(`
        UPDATE subscriptions
        SET tier = ?, payment_token = ?, amount_per_month = ?,
            current_period_end = datetime('now', '+1 month'),
            status = 'active'
        WHERE id = ?
      `).run(tier, verification.token, `${getTierPriceUsd(tier)} ${verification.token}`, subscriptionId);
    } else {
      subscriptionId = uuidv4();
      db().prepare(`
        INSERT INTO subscriptions (id, user_id, tier, payment_token, amount_per_month, current_period_start, current_period_end)
        VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now', '+1 month'))
      `).run(subscriptionId, userId, tier, verification.token, `${getTierPriceUsd(tier)} ${verification.token}`);
    }

    // 4. Record the payment
    const paymentId = uuidv4();
    db().prepare(`
      INSERT INTO payments (id, subscription_id, tx_signature, token, amount, verified_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(paymentId, subscriptionId, tx_signature, verification.token, verification.amount);

    // 5. Return subscription details
    const subscription = db()
      .prepare('SELECT * FROM subscriptions WHERE id = ?')
      .get(subscriptionId);

    res.json({
      success: true,
      subscription,
      payment: {
        id: paymentId,
        token: verification.token,
        amount: verification.amount,
        amount_usd: verification.amountUsd,
      },
    });
  } catch (err) {
    console.error('[payments/verify] error:', err);
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Internal server error',
    });
  }
});

/**
 * GET /api/payments/quote
 * Get current price quote for a tier in all supported tokens
 *
 * Query: ?tier=starter
 */
router.get('/quote', async (_req, res) => {
  const schema = z.object({ tier: z.enum(['starter', 'pro']) });
  const parse = schema.safeParse({ tier: _req.query.tier });
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid tier', valid: ['starter', 'pro'] });
  }

  const tierPriceUsd = getTierPriceUsd(parse.data.tier);
  if (!tierPriceUsd) {
    return res.status(400).json({ error: 'Unknown tier' });
  }

  const recipient = process.env.PLATFORM_WALLET_ADDRESS;
  if (!recipient) {
    return res.status(500).json({ error: 'PLATFORM_WALLET_ADDRESS not configured' });
  }

  try {
    // Get SOL price for conversion
    const solRes = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
      { headers: { Accept: 'application/json' } }
    );
    const solData = (await solRes.json()) as { solana?: { usd?: number } };
    const solPrice = solData.solana?.usd ?? 150;

    const solAmount = tierPriceUsd / solPrice;

    res.json({
      tier: parse.data.tier,
      usd: tierPriceUsd,
      recipient,
      tokens: {
        SOL: { amount: solAmount.toFixed(4), price_usd: solPrice },
        USDC: { amount: tierPriceUsd.toFixed(2) },
        USDT: { amount: tierPriceUsd.toFixed(2) },
        HERD: { amount: 'TBD', note: 'Set HERD_MINT_ADDRESS env var' },
      },
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch price data' });
  }
});

export default router;
