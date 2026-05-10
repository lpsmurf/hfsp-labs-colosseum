import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { createUserKey, getKeyUsage } from '../services/openrouter-provisioner.js';

const router = Router();

// Simple shared-secret guard for service-to-service calls
const INTERNAL_KEY = process.env.PLATFORM_INTERNAL_KEY ?? '';
router.use((req, res, next) => {
  if (INTERNAL_KEY && req.headers['x-internal-key'] !== INTERNAL_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// GET /api/internal/onboarding/by-chat/:chatId
// Returns OnboardingRecord for the guardrail hook lookup fn
router.get('/onboarding/by-chat/:chatId', (req, res) => {
  const chatId = parseInt(req.params.chatId, 10);
  if (isNaN(chatId)) return res.status(400).json({ error: 'Invalid chatId' });

  const row = db().prepare(`
    SELECT tp.chat_id, tp.paired_at, tp.onboarding_state, tp.email, tp.onboarded_at, a.user_id
    FROM telegram_pairings tp
    JOIN agents a ON a.id = tp.agent_id
    WHERE tp.chat_id = ?
    LIMIT 1
  `).get(chatId) as Record<string, unknown> | undefined;

  if (!row) return res.status(404).json(null);

  res.json({
    chatId: row.chat_id,
    userId: `telegram:${row.chat_id}`,
    state: row.onboarding_state ?? 'not_started',
    email: row.email ?? null,
    pairedAt: row.paired_at ?? null,
  });
});

// POST /api/internal/onboarding/save-email
// Saves email and transitions onboarding_state → 'onboarded'
router.post('/onboarding/save-email', (req, res) => {
  const schema = z.object({ chatId: z.number().int(), email: z.string().email() });
  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Invalid request' });

  const { chatId, email } = parse.data;

  // Enforce unique email (UNIQUE index on telegram_pairings.email)
  try {
    db().prepare(`
      UPDATE telegram_pairings
      SET email = ?, onboarding_state = 'onboarded', onboarded_at = datetime('now')
      WHERE chat_id = ?
    `).run(email.toLowerCase(), chatId);
  } catch (err: unknown) {
    const msg = String(err);
    if (msg.includes('UNIQUE') || msg.includes('unique')) {
      return res.status(409).json({ error: 'UNIQUE constraint failed' });
    }
    throw err;
  }

  res.json({ success: true });
});

// POST /api/internal/onboarding/advance-state
// Moves onboarding state forward (e.g. not_started → awaiting_email)
router.post('/onboarding/advance-state', (req, res) => {
  const schema = z.object({
    chatId: z.number().int(),
    state: z.enum(['not_started', 'awaiting_email', 'onboarded']),
  });
  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Invalid request' });

  const { chatId, state } = parse.data;
  db().prepare(`UPDATE telegram_pairings SET onboarding_state = ? WHERE chat_id = ?`).run(state, chatId);
  res.json({ success: true });
});

// POST /api/internal/pairing/claim
// Links a chatId to an agent via pair code; provisions a free-trial OpenRouter key
router.post('/pairing/claim', async (req, res) => {
  const schema = z.object({
    chatId: z.number().int(),
    pairCode: z.string().min(1),
  });
  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Invalid request' });

  const { chatId, pairCode } = parse.data;

  const row = db().prepare(`
    SELECT tp.id, tp.agent_id, a.user_id
    FROM telegram_pairings tp
    JOIN agents a ON a.id = tp.agent_id
    WHERE tp.pair_code = ? AND tp.expires_at > datetime('now') AND tp.chat_id IS NULL
  `).get(pairCode.toUpperCase()) as { id: string; agent_id: string; user_id: string } | undefined;

  if (!row) {
    return res.status(404).json({ error: 'Invalid or expired pair code' });
  }

  db().prepare(`
    UPDATE telegram_pairings
    SET chat_id = ?, paired_at = datetime('now'), onboarding_state = 'not_started'
    WHERE id = ?
  `).run(chatId, row.id);

  // Provision a $5 OpenRouter child key for this trial user
  const trialUserId = `telegram:${chatId}`;
  const provisioningKey = process.env.OPENROUTER_PROVISIONING_KEY ?? '';
  if (provisioningKey) {
    try {
      const existing = db().prepare(
        "SELECT id FROM api_keys WHERE user_id = ? AND provider LIKE 'openrouter:%'"
      ).get(trialUserId);
      if (!existing) {
        await createUserKey(trialUserId, 5.00);
      }
    } catch (err) {
      // Non-fatal — credit guard degrades gracefully
      console.warn('[internal/pairing/claim] OpenRouter key provision failed:', (err as Error).message);
    }
  }

  res.json({ success: true, agentId: row.agent_id, userId: trialUserId });
});

// GET /api/internal/pairing/by-chat/:chatId
// Returns PairingRecord for the auth guard lookup fn
router.get('/pairing/by-chat/:chatId', async (req, res) => {
  const chatId = parseInt(req.params.chatId, 10);
  if (isNaN(chatId)) return res.status(400).json({ error: 'Invalid chatId' });

  const row = db().prepare(`
    SELECT tp.chat_id, tp.paired_at, tp.onboarding_state
    FROM telegram_pairings tp
    WHERE tp.chat_id = ?
    LIMIT 1
  `).get(chatId) as Record<string, unknown> | undefined;

  if (!row) return res.json(null);

  const userId = `telegram:${chatId}`;
  let creditsUsd = 5.0;

  try {
    const keyRow = db().prepare(
      "SELECT provider FROM api_keys WHERE user_id = ? AND provider LIKE 'openrouter:%' ORDER BY created_at DESC LIMIT 1"
    ).get(userId) as { provider: string } | undefined;

    if (keyRow) {
      const keyHash = keyRow.provider.replace('openrouter:', '');
      const usage = await getKeyUsage(keyHash);
      creditsUsd = usage.remaining;
    }
  } catch {
    // OpenRouter unreachable — use default; credit guard will re-check post-response
  }

  res.json({
    userId,
    paired: !!row.paired_at,
    subscriptionActive: row.onboarding_state === 'onboarded',
    creditsUsd,
  });
});

// GET /api/internal/credits/:userId
// Returns CreditBalance for the credit guard lookup fn
router.get('/credits/:userId', async (req, res) => {
  const userId = decodeURIComponent(req.params.userId);

  try {
    const keyRow = db().prepare(
      "SELECT provider FROM api_keys WHERE user_id = ? AND provider LIKE 'openrouter:%' ORDER BY created_at DESC LIMIT 1"
    ).get(userId) as { provider: string } | undefined;

    if (!keyRow) return res.json({ remaining: 5.0, limit: 5.0 });

    const keyHash = keyRow.provider.replace('openrouter:', '');
    const usage = await getKeyUsage(keyHash);
    res.json({ remaining: usage.remaining, limit: usage.limit });
  } catch {
    res.json({ remaining: 5.0, limit: 5.0 }); // degraded fallback
  }
});

export default router;
