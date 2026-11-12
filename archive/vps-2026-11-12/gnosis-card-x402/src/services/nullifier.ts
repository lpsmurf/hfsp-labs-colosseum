/**
 * Nullifier store — prevents double-spending the same payment signature.
 *
 * Uses Redis with TTL. Falls back to in-memory Set for dev if Redis is unavailable.
 */

import { Redis } from 'ioredis';
import { config } from '../config.js';

let redis: Redis | null = null;
const memFallback = new Set<string>();

function getRedis(): Redis | null {
  if (!redis) {
    try {
      redis = new Redis(config.REDIS_URL, { lazyConnect: true, enableOfflineQueue: false });
      redis.on('error', () => { redis = null; });
    } catch {
      redis = null;
    }
  }
  return redis;
}

const DEFAULT_TTL = 30 * 24 * 3600; // 30 days

export async function isSpent(nullifier: string): Promise<boolean> {
  const r = getRedis();
  if (r) {
    try {
      return (await r.get(`nullifier:${nullifier}`)) !== null;
    } catch { /* fall through */ }
  }
  return memFallback.has(nullifier);
}

export async function markSpent(nullifier: string, ttlSeconds: number = DEFAULT_TTL): Promise<void> {
  const r = getRedis();
  if (r) {
    try {
      await r.set(`nullifier:${nullifier}`, '1', 'EX', ttlSeconds);
      return;
    } catch { /* fall through */ }
  }
  memFallback.add(nullifier);
  setTimeout(() => memFallback.delete(nullifier), ttlSeconds * 1000);
}
