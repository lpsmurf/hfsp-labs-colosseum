/**
 * OpenRouter Child Key Provisioner
 *
 * Creates, reads, tops up, and deletes OpenRouter child keys via the partner API.
 * All keys are encrypted at rest with AES-256-GCM via key-vault.ts.
 */

import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { encrypt, decrypt } from './key-vault.js';
import { db } from '../db/index.js';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const PARENT_KEY = process.env.POLY_OPENROUTER_KEY ?? '';

function authHeaders() {
  if (!PARENT_KEY) throw new Error('POLY_OPENROUTER_KEY not configured');
  return { Authorization: `Bearer ${PARENT_KEY}` };
}

export interface KeyRecord {
  id: string;
  user_id: string;
  key_hash: string;
  encrypted_key: string;
  iv: string;
  limit_usd: number;
  created_at: string;
}

export interface KeyUsage {
  usage: number;
  limit: number;
  remaining: number;
}

/**
 * Create a child key for a user, encrypt it, and store in DB.
 * Returns the key hash (for lookups) and the raw key (for one-time injection).
 */
export async function createUserKey(
  userId: string,
  limitUsd: number
): Promise<{ keyHash: string; key: string }> {
  const res = await axios.post(
    `${OPENROUTER_BASE}/keys`,
    { name: `openclaw-${userId}-${Date.now()}`, limit: limitUsd },
    { headers: authHeaders(), timeout: 15000 }
  );

  const key: string = res.data?.data?.key;
  const keyHash: string = res.data?.data?.hash;
  if (!key || !keyHash) {
    throw new Error('OpenRouter did not return a key or hash');
  }

  const vault = encrypt(key);
  db().prepare(`
    INSERT INTO api_keys (id, user_id, provider, encrypted_key, iv)
    VALUES (?, ?, ?, ?, ?)
  `).run(uuidv4(), userId, 'openrouter', vault.encrypted, vault.iv);

  return { keyHash, key };
}

/**
 * Get usage for a child key by its hash.
 */
export async function getKeyUsage(keyHash: string): Promise<KeyUsage> {
  const res = await axios.get(
    `${OPENROUTER_BASE}/keys/${keyHash}`,
    { headers: authHeaders(), timeout: 15000 }
  );

  const data = res.data?.data ?? {};
  const limit = parseFloat(data.limit) || 0;
  const usage = parseFloat(data.usage) || 0;
  return { usage, limit, remaining: Math.max(0, limit - usage) };
}

/**
 * Top up a child key by increasing its limit.
 */
export async function topUpKey(keyHash: string, additionalUsd: number): Promise<void> {
  const current = await getKeyUsage(keyHash);
  const newLimit = current.limit + additionalUsd;

  await axios.patch(
    `${OPENROUTER_BASE}/keys/${keyHash}`,
    { limit: newLimit },
    { headers: authHeaders(), timeout: 15000 }
  );
}

/**
 * Delete a child key on OpenRouter and remove from local DB.
 */
export async function deleteKey(keyHash: string): Promise<void> {
  await axios.delete(
    `${OPENROUTER_BASE}/keys/${keyHash}`,
    { headers: authHeaders(), timeout: 15000 }
  );

  db().prepare("DELETE FROM api_keys WHERE provider = 'openrouter' AND encrypted_key = ?").run(keyHash);
}

/**
 * Decrypt a stored OpenRouter child key for injection at deploy time.
 * Looks up by user_id — returns the most recent openrouter key.
 */
export function getDecryptedKey(userId: string): string | null {
  const row = db()
    .prepare("SELECT encrypted_key, iv FROM api_keys WHERE user_id = ? AND provider = 'openrouter' ORDER BY created_at DESC LIMIT 1")
    .get(userId) as { encrypted_key: string; iv: string } | undefined;

  if (!row) return null;
  return decrypt(row.encrypted_key, row.iv);
}
