/**
 * Hook 3 — Auth Guard
 *
 * Intercepts: BEFORE message reaches the agent brain.
 * Verifies:
 *   - chatId is paired to a user (not an anonymous visitor)
 *   - User has an active subscription / credits remaining
 *   - chatId maps to exactly one user (no cross-user routing leakage)
 *
 * The pairing store is injected so this hook stays testable without a DB.
 */

import { GuardrailContext, GuardrailResult } from './types.js';

export interface PairingRecord {
  userId: string;
  paired: boolean;
  subscriptionActive: boolean;
  creditsUsd: number;
}

// Injected at startup — swap for a real DB lookup in production
export type PairingLookup = (chatId: number) => Promise<PairingRecord | null>;

let _lookup: PairingLookup | null = null;

export function configurePairingLookup(fn: PairingLookup): void {
  _lookup = fn;
}

const MIN_CREDITS_USD = 0.001;  // must have at least $0.001 to proceed

export async function authGuardHook(ctx: GuardrailContext): Promise<GuardrailResult> {
  if (!_lookup) {
    // Fail open in dev if no lookup configured — fail closed in prod
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd) {
      return {
        decision: 'block',
        userMessage: 'Auth service unavailable. Please try again shortly.',
        audit: { hook: 'auth-guard', decision: 'block', reason: 'lookup_not_configured' },
      };
    }
    return {
      decision: 'allow',
      audit: { hook: 'auth-guard', decision: 'allow', reason: 'dev_mode_bypass' },
    };
  }

  const record = await _lookup(ctx.chatId);

  // 1. Unknown chatId — not paired
  if (!record) {
    return {
      decision: 'block',
      userMessage:
        "I don't recognise this chat. Use the deeplink from your Clawdrop dashboard to connect your agent, or visit clawdrop.live to get started.",
      audit: { hook: 'auth-guard', decision: 'block', reason: 'unpaired_chat_id', meta: { chatId: ctx.chatId } },
    };
  }

  // 2. Pairing incomplete
  if (!record.paired) {
    return {
      decision: 'block',
      userMessage: "Your agent isn't paired yet. Click the deeplink from your dashboard to finish setup.",
      audit: { hook: 'auth-guard', decision: 'block', reason: 'pairing_incomplete' },
    };
  }

  // 3. Subscription lapsed
  if (!record.subscriptionActive) {
    return {
      decision: 'block',
      userMessage:
        '⚠️ Your Poly subscription has expired. Top up at clawdrop.live to resume.',
      audit: { hook: 'auth-guard', decision: 'block', reason: 'subscription_inactive' },
    };
  }

  // 4. Credits depleted
  if (record.creditsUsd < MIN_CREDITS_USD) {
    return {
      decision: 'block',
      userMessage:
        `💸 You're out of credits ($${record.creditsUsd.toFixed(4)} remaining). Top up at clawdrop.live to continue.`,
      audit: {
        hook: 'auth-guard',
        decision: 'block',
        reason: 'credits_depleted',
        meta: { creditsUsd: record.creditsUsd },
      },
    };
  }

  return {
    decision: 'allow',
    audit: {
      hook: 'auth-guard',
      decision: 'allow',
      reason: 'authenticated',
      meta: { userId: record.userId, creditsUsd: record.creditsUsd },
    },
  };
}
