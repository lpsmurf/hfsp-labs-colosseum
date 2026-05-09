/**
 * Hook 8 — Credit Guard
 *
 * Intercepts: AFTER the agent responds, BEFORE sending to Telegram.
 * Checks whether the user's OpenRouter child key is near depletion.
 *
 * Rules:
 *   - If remaining credits drop below WARN_THRESHOLD_USD: append a low-balance notice
 *   - If remaining credits are zero or negative: block the response and prompt top-up
 *
 * This is the last line of defence against a depleted account silently failing.
 * The authGuardHook (hook 3) checks at message intake; this checks at send time
 * to catch cases where a single expensive tool chain drained the balance.
 */

import { GuardrailContext, GuardrailResult } from './types.js';

const WARN_THRESHOLD_USD = 0.50;   // warn when under $0.50
const BLOCK_THRESHOLD_USD = 0.001; // block when under $0.001

export interface CreditBalance {
  remaining: number;  // USD
  limit: number;      // USD
}

// Injected at startup — should call OpenRouter GET /api/v1/keys/{hash}
export type CreditsLookup = (userId: string) => Promise<CreditBalance | null>;

let _creditsLookup: CreditsLookup | null = null;

export function configureCreditLookup(fn: CreditsLookup): void {
  _creditsLookup = fn;
}

export async function creditGuardHook(ctx: GuardrailContext): Promise<GuardrailResult> {
  if (!_creditsLookup) {
    // Fail open in dev
    return {
      decision: 'allow',
      audit: { hook: 'credit-guard', decision: 'allow', reason: 'lookup_not_configured' },
    };
  }

  let balance: CreditBalance | null = null;

  try {
    balance = await _creditsLookup(ctx.userId);
  } catch {
    // Don't block on lookup failure — degraded mode allows response through
    return {
      decision: 'allow',
      audit: { hook: 'credit-guard', decision: 'allow', reason: 'lookup_failed_degraded' },
    };
  }

  if (!balance) {
    return {
      decision: 'allow',
      audit: { hook: 'credit-guard', decision: 'allow', reason: 'balance_unknown' },
    };
  }

  const { remaining, limit } = balance;

  // Hard block — fully depleted
  if (remaining < BLOCK_THRESHOLD_USD) {
    return {
      decision: 'block',
      userMessage:
        `💸 You've used all your Poly credits ($${limit.toFixed(2)} total).\n\nTop up at clawdrop.live to keep going — your agent and chat history are saved.`,
      audit: {
        hook: 'credit-guard',
        decision: 'block',
        reason: 'credits_exhausted',
        meta: { remaining, limit },
      },
    };
  }

  // Soft warn — low balance, but allow through
  if (remaining < WARN_THRESHOLD_USD) {
    // We signal the low balance via the audit; pipeline appends a notice to the response
    return {
      decision: 'allow',
      sanitizedText: `⚠️ Low balance: $${remaining.toFixed(3)} remaining. Top up at clawdrop.live to avoid interruption.`,
      audit: {
        hook: 'credit-guard',
        decision: 'allow',
        reason: 'low_balance_warning',
        meta: { remaining, limit },
      },
    };
  }

  return {
    decision: 'allow',
    audit: {
      hook: 'credit-guard',
      decision: 'allow',
      reason: 'sufficient_credits',
      meta: { remaining, limit },
    },
  };
}
