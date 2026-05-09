/**
 * Hook 2 — Rate Limiter
 *
 * Intercepts: BEFORE message reaches the agent brain.
 * Uses a sliding window counter per chatId stored in memory.
 *
 * Limits:
 *   - 10 messages per 60 seconds per user (burst)
 *   - 60 messages per 10 minutes per user (sustained)
 *
 * Why: one stuck loop or bad actor could drain OpenRouter credits
 * for the entire platform in minutes.
 */

import { GuardrailContext, GuardrailResult } from './types.js';

interface WindowEntry {
  timestamps: number[];   // rolling list of message arrival times (ms)
}

// In-memory store — fine for single-process; swap for Redis in production
const windows = new Map<string, WindowEntry>();

const BURST_LIMIT = 10;         // max messages
const BURST_WINDOW_MS = 60_000; // in 60 seconds

const SUSTAINED_LIMIT = 60;         // max messages
const SUSTAINED_WINDOW_MS = 600_000; // in 10 minutes

function evict(entry: WindowEntry, cutoff: number): void {
  entry.timestamps = entry.timestamps.filter(t => t > cutoff);
}

export async function rateLimiterHook(ctx: GuardrailContext): Promise<GuardrailResult> {
  const key = String(ctx.chatId);
  const now = Date.now();

  if (!windows.has(key)) {
    windows.set(key, { timestamps: [] });
  }

  const entry = windows.get(key)!;

  // Evict anything outside the largest window we track
  evict(entry, now - SUSTAINED_WINDOW_MS);

  // Check sustained limit
  if (entry.timestamps.length >= SUSTAINED_LIMIT) {
    return {
      decision: 'block',
      userMessage: `⏳ You've sent a lot of messages lately. Wait a few minutes before trying again.`,
      audit: {
        hook: 'rate-limiter',
        decision: 'block',
        reason: 'sustained_limit_exceeded',
        meta: { count: entry.timestamps.length, window: '10min' },
      },
    };
  }

  // Check burst limit (last 60s only)
  const burstCount = entry.timestamps.filter(t => t > now - BURST_WINDOW_MS).length;
  if (burstCount >= BURST_LIMIT) {
    const oldestInWindow = Math.min(...entry.timestamps.filter(t => t > now - BURST_WINDOW_MS));
    const retryIn = Math.ceil((oldestInWindow + BURST_WINDOW_MS - now) / 1000);
    return {
      decision: 'block',
      userMessage: `⏳ Slow down a little — try again in ${retryIn}s.`,
      audit: {
        hook: 'rate-limiter',
        decision: 'block',
        reason: 'burst_limit_exceeded',
        meta: { burstCount, retryInSeconds: retryIn },
      },
    };
  }

  // Record this message
  entry.timestamps.push(now);

  return {
    decision: 'allow',
    audit: {
      hook: 'rate-limiter',
      decision: 'allow',
      reason: 'within_limits',
      meta: { burstCount: burstCount + 1, sustainedCount: entry.timestamps.length },
    },
  };
}
