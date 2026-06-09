/**
 * Gnosis Pay API client.
 *
 * Auth model:
 *   - Partners interact on behalf of users via per-user JWT tokens.
 *   - JWT obtained via SIWE (Sign-In with Ethereum): user signs a nonce
 *     with their EVM wallet in the browser, our server exchanges it for a JWT.
 *   - Sessions stored in Redis keyed by our session ID.
 *
 * For Option 1 (top-up): no GP API needed — bridge handles deposit directly.
 * For Option 2 (onboarding): full lifecycle managed here.
 */

import { Redis } from 'ioredis';
import { randomUUID } from 'crypto';
import { config } from '../config.js';

const GP = config.GP_API_URL;

// ─── Redis session store ───────────────────────────────────────────────────────

let _redis: Redis | null = null;
const _mem = new Map<string, string>(); // dev fallback

function getRedis(): Redis | null {
  if (!_redis) {
    try {
      _redis = new Redis(config.REDIS_URL, { lazyConnect: true, enableOfflineQueue: false });
      _redis.on('error', () => { _redis = null; });
    } catch { _redis = null; }
  }
  return _redis;
}

const SESSION_TTL = 3600 * 24; // 24 hours

async function sessionGet(id: string): Promise<OnboardSession | null> {
  const r = getRedis();
  const raw = r ? await r.get(`gp:session:${id}`).catch(() => null) : _mem.get(id) ?? null;
  return raw ? JSON.parse(raw) as OnboardSession : null;
}

async function sessionSet(id: string, s: OnboardSession): Promise<void> {
  const raw = JSON.stringify(s);
  const r = getRedis();
  if (r) await r.set(`gp:session:${id}`, raw, 'EX', SESSION_TTL).catch(() => null);
  else _mem.set(id, raw);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type OnboardStatus =
  | 'awaiting_terms'
  | 'awaiting_kyc'
  | 'awaiting_safe'
  | 'awaiting_card'
  | 'complete'
  | 'failed';

export interface OnboardSession {
  id:            string;
  walletAddress: string;
  jwt:           string;
  status:        OnboardStatus;
  safeAddress?:  string;
  cardId?:       string;
  error?:        string;
  paidAt:        number;
  updatedAt:     number;
}

export interface GPCard {
  id:         string;
  status:     string;
  last4?:     string;
  type:       'virtual' | 'physical';
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function gpFetch<T>(
  path: string,
  opts: { method?: string; jwt?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.jwt)          headers['Authorization'] = `Bearer ${opts.jwt}`;
  if (config.GP_APP_ID)  headers['X-App-Id']      = config.GP_APP_ID;

  const res = await fetch(`${GP}${path}`, {
    method:  opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers,
    body:    opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`GP API ${path} → ${res.status}: ${msg}`);
  }

  return res.json() as Promise<T>;
}

// ─── SIWE auth ────────────────────────────────────────────────────────────────

/**
 * Step 1 of SIWE: get a nonce for the given wallet address.
 * Frontend signs: EIP-4361 message containing this nonce.
 */
export async function getSiweNonce(walletAddress: string): Promise<string> {
  const headers: Record<string, string> = {};
  if (config.GP_APP_ID) headers['X-App-Id'] = config.GP_APP_ID;
  const res = await fetch(`${GP}/api/v1/auth/nonce?address=${walletAddress}`, { headers });
  if (!res.ok) throw new Error(`GP nonce → ${res.status}: ${await res.text().catch(() => '')}`);
  const text = await res.text();
  // GP returns either plain-text nonce or JSON { nonce }
  try { return (JSON.parse(text) as { nonce: string }).nonce; } catch { return text.trim(); }
}

/**
 * Step 2 of SIWE: exchange signed message for a GP JWT.
 * `siweMessage` is the full EIP-4361 string, `signature` is the user's wallet signature.
 */
export async function verifyAndGetJwt(siweMessage: string, signature: string): Promise<string> {
  const data = await gpFetch<{ token: string }>('/api/v1/auth/verify', {
    method: 'POST',
    body:   { message: siweMessage, signature },
  });
  return data.token;
}

// ─── Session lifecycle ────────────────────────────────────────────────────────

/**
 * Create a new onboarding session after x402 payment is confirmed.
 * jwt comes from the frontend after SIWE verification.
 */
export async function createSession(walletAddress: string, jwt: string): Promise<OnboardSession> {
  const session: OnboardSession = {
    id:            randomUUID(),
    walletAddress,
    jwt,
    status:        'awaiting_terms',
    paidAt:        Date.now(),
    updatedAt:     Date.now(),
  };
  await sessionSet(session.id, session);
  return session;
}

export async function getSession(id: string): Promise<OnboardSession | null> {
  return sessionGet(id);
}

async function updateSession(id: string, patch: Partial<OnboardSession>): Promise<OnboardSession> {
  const session = await sessionGet(id);
  if (!session) throw new Error(`Session ${id} not found`);
  const updated = { ...session, ...patch, updatedAt: Date.now() };
  await sessionSet(id, updated);
  return updated;
}

// ─── Onboarding steps ─────────────────────────────────────────────────────────

/**
 * Fetch outstanding Terms & Conditions IDs from GP, then accept them all.
 */
export async function acceptTerms(sessionId: string): Promise<OnboardSession> {
  const s = await getSession(sessionId);
  if (!s) throw new Error('Session not found');

  // Fetch all terms
  const terms = await gpFetch<Array<{ id: string; title: string }>>(
    '/api/v1/terms', { jwt: s.jwt }
  );
  const ids = terms.map(t => t.id);

  // Accept each
  await gpFetch('/api/v1/user/terms', {
    method: 'POST',
    jwt:    s.jwt,
    body:   { termIds: ids },
  });

  return updateSession(sessionId, { status: 'awaiting_kyc' });
}

/**
 * Retrieve a Sumsub access token so the frontend can render the KYC widget.
 * Sumsub SDK: https://sumsub.com/developers/
 */
export async function getKycToken(sessionId: string): Promise<{ kycToken: string; kycUrl: string }> {
  const s = await getSession(sessionId);
  if (!s) throw new Error('Session not found');

  const data = await gpFetch<{ token: string; reviewUrl?: string }>(
    '/api/v1/kyc/access-token', { jwt: s.jwt }
  );

  return { kycToken: data.token, kycUrl: data.reviewUrl ?? 'https://in.sumsub.com/idensic' };
}

/**
 * Called by our Sumsub webhook when KYC is approved.
 * Triggers Safe deployment automatically.
 */
export async function onKycApproved(sessionId: string): Promise<OnboardSession> {
  const s = await getSession(sessionId);
  if (!s) throw new Error('Session not found');

  // Trigger Safe deployment
  await gpFetch('/api/v1/safe/deploy', { method: 'POST', jwt: s.jwt });

  return updateSession(sessionId, { status: 'awaiting_safe' });
}

/**
 * Poll Safe deployment status. Resolves when accountStatus === 0.
 */
export async function pollSafeDeployment(sessionId: string): Promise<OnboardSession> {
  const s = await getSession(sessionId);
  if (!s) throw new Error('Session not found');

  const data = await gpFetch<{ accountStatus: number; safe?: { address: string } }>(
    '/api/v1/safe/status', { jwt: s.jwt }
  );

  if (data.accountStatus === 0 && data.safe?.address) {
    return updateSession(sessionId, {
      status:      'awaiting_card',
      safeAddress: data.safe.address,
    });
  }

  return s; // still deploying
}

/**
 * Create a virtual card once Safe is deployed.
 */
export async function createVirtualCard(sessionId: string): Promise<OnboardSession> {
  const s = await getSession(sessionId);
  if (!s) throw new Error('Session not found');
  if (s.status !== 'awaiting_card') {
    throw new Error(`Session is ${s.status}, not awaiting_card`);
  }

  const card = await gpFetch<GPCard>('/api/v1/cards/virtual', {
    method: 'POST',
    jwt:    s.jwt,
  });

  return updateSession(sessionId, {
    status: 'complete',
    cardId: card.id,
  });
}

/**
 * List all cards for the authenticated user.
 */
export async function getCards(jwt: string): Promise<GPCard[]> {
  const data = await gpFetch<GPCard[]>('/api/v1/cards', { jwt });
  return data;
}
