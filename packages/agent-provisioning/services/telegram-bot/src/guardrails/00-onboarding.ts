/**
 * Hook 0 — Onboarding Gate
 *
 * Intercepts: BEFORE everything else, on every message from an unverified user.
 * This is the very first thing that runs — before input validation, before auth.
 *
 * Flow:
 *   Step 1 — User sends /start <pair_code>
 *            → Bot responds: "Welcome to Poly! What's your email?"
 *            → State set to AWAITING_EMAIL
 *
 *   Step 2 — User replies with their email
 *            → Email validated (format + not already registered)
 *            → Stored, state set to ONBOARDED
 *            → Bot responds with welcome + quick-start tips
 *
 *   Step 3 — All subsequent messages pass straight through (this hook is a no-op)
 *
 * If user is not paired at all (no pair_code), hook defers to Auth Guard (hook 3).
 * This hook only handles the onboarding window between pairing and first use.
 */

import { GuardrailContext, GuardrailResult } from './types.js';

// --- State ---

export type OnboardingState = 'not_started' | 'awaiting_email' | 'onboarded';

export interface OnboardingRecord {
  chatId: number;
  userId: string;
  state: OnboardingState;
  email?: string;
  pairedAt?: number;
}

// Injected at startup
export type OnboardingLookup = (chatId: number) => Promise<OnboardingRecord | null>;
export type OnboardingEmailSaver = (chatId: number, email: string) => Promise<void>;

let _lookup: OnboardingLookup | null = null;
let _saveEmail: OnboardingEmailSaver | null = null;

export function configureOnboarding(
  lookup: OnboardingLookup,
  saveEmail: OnboardingEmailSaver,
): void {
  _lookup = lookup;
  _saveEmail = saveEmail;
}

// --- Email validation ---

const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

function isValidEmail(input: string): boolean {
  return EMAIL_RE.test(input.trim()) && input.trim().length <= 254;
}

// --- Messages ---

const WELCOME_MESSAGE = `👋 *Welcome to Poly* — your crypto AI agent on Solana.

Before we get started, I need your email address so we can send you important updates about your agent, billing, and security alerts.

📧 *What's your email?*`;

const ONBOARDED_MESSAGE = (email: string) =>
  `✅ *You're all set!*

Your email *${email}* has been registered.

Here's what I can do for you:
• 💰 Check token prices — _"What's SOL trading at?"_
• 👛 View your wallet — _"Show my portfolio"_
• 📈 Market intel — _"What's trending today?"_
• 🔄 Swap tokens — _"Swap 0.1 SOL for USDC"_
• 🔍 Token research — _"Is this token risky?"_

What would you like to know first?`;

const INVALID_EMAIL_MESSAGE = `That doesn't look like a valid email address. Please try again.

📧 *What's your email?*`;

const ALREADY_REGISTERED_MESSAGE = (email: string) =>
  `⚠️ That email is already linked to another account. Please use a different email address.

📧 *What's your email?*`;

// --- Hook ---

export async function onboardingHook(ctx: GuardrailContext): Promise<GuardrailResult> {
  // Dev bypass
  if (!_lookup || !_saveEmail) {
    return {
      decision: 'allow',
      audit: { hook: 'onboarding', decision: 'allow', reason: 'dev_bypass' },
    };
  }

  const record = await _lookup(ctx.chatId);

  // Not paired yet — let Auth Guard handle it
  if (!record) {
    return {
      decision: 'allow',
      audit: { hook: 'onboarding', decision: 'allow', reason: 'not_paired_defer_to_auth' },
    };
  }

  // Already onboarded — pass straight through
  if (record.state === 'onboarded') {
    return {
      decision: 'allow',
      audit: { hook: 'onboarding', decision: 'allow', reason: 'already_onboarded' },
    };
  }

  // State: not_started (just paired, first message ever)
  if (record.state === 'not_started') {
    return {
      decision: 'block',
      userMessage: WELCOME_MESSAGE,
      audit: {
        hook: 'onboarding',
        decision: 'block',
        reason: 'onboarding_not_started',
        meta: { chatId: ctx.chatId },
      },
    };
    // Note: the webhook handler must set state → 'awaiting_email' after sending this message
  }

  // State: awaiting_email — the current message IS the email attempt
  if (record.state === 'awaiting_email') {
    const input = ctx.messageText.trim();

    // Validate format
    if (!isValidEmail(input)) {
      return {
        decision: 'block',
        userMessage: INVALID_EMAIL_MESSAGE,
        audit: {
          hook: 'onboarding',
          decision: 'block',
          reason: 'invalid_email_format',
          meta: { input },
        },
      };
    }

    // Save the email + mark onboarded
    try {
      await _saveEmail(ctx.chatId, input.toLowerCase());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Duplicate email — already registered to another account
      if (msg.includes('UNIQUE') || msg.includes('duplicate')) {
        return {
          decision: 'block',
          userMessage: ALREADY_REGISTERED_MESSAGE(input),
          audit: {
            hook: 'onboarding',
            decision: 'block',
            reason: 'duplicate_email',
            meta: { input },
          },
        };
      }
      throw err;
    }

    // Success — unblock with the onboarded welcome message
    return {
      decision: 'block',        // still 'block' because we send a custom response
      userMessage: ONBOARDED_MESSAGE(input.toLowerCase()),
      audit: {
        hook: 'onboarding',
        decision: 'block',
        reason: 'onboarding_complete',
        meta: { email: input.toLowerCase() },
      },
    };
    // Note: webhook handler must set state → 'onboarded' after this
  }

  // Fallback — unknown state, fail open
  return {
    decision: 'allow',
    audit: { hook: 'onboarding', decision: 'allow', reason: 'unknown_state_fallback' },
  };
}
