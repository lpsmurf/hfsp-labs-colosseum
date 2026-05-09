/**
 * Hook 5 — Swap Guard
 *
 * Intercepts: BEFORE swap_tokens tool call executes.
 * This is the most critical financial guardrail.
 *
 * Rules:
 *   - Swaps > CONFIRM_THRESHOLD_USD require explicit user approval (✅/❌ buttons)
 *   - Mainnet swaps are hard-blocked during trial period
 *   - Slippage > MAX_SLIPPAGE_BPS is blocked
 *   - Missing or invalid wallet address is blocked
 */

import { GuardrailContext, GuardrailResult } from './types.js';

const CONFIRM_THRESHOLD_USD = 10;   // swaps over $10 need confirmation
const MAX_SLIPPAGE_BPS = 500;       // 5% max slippage
const TRIAL_NETWORK = 'devnet';     // force devnet during trial

// Valid Solana address: base58, 32–44 chars
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function swapGuardHook(ctx: GuardrailContext): Promise<GuardrailResult> {
  if (!ctx.toolCall || ctx.toolCall.name !== 'swap_tokens') {
    return {
      decision: 'allow',
      audit: { hook: 'swap-guard', decision: 'allow', reason: 'not_a_swap' },
    };
  }

  const args = ctx.toolCall.args as {
    network?: string;
    inputMint?: string;
    outputMint?: string;
    amountUsd?: number;
    amountSol?: number;
    slippageBps?: number;
    walletAddress?: string;
  };

  // 1. Hard-block mainnet during trial
  if (args.network && args.network !== TRIAL_NETWORK) {
    return {
      decision: 'block',
      userMessage: `🚫 Mainnet swaps are not available during the trial period. All swaps run on Solana devnet.`,
      audit: {
        hook: 'swap-guard',
        decision: 'block',
        reason: 'mainnet_blocked',
        meta: { requestedNetwork: args.network },
      },
    };
  }

  // 2. Validate wallet address format
  if (args.walletAddress && !SOLANA_ADDRESS_RE.test(args.walletAddress)) {
    return {
      decision: 'block',
      userMessage: `⚠️ That doesn't look like a valid Solana wallet address. Please check and try again.`,
      audit: {
        hook: 'swap-guard',
        decision: 'block',
        reason: 'invalid_wallet_address',
        meta: { walletAddress: args.walletAddress },
      },
    };
  }

  // 3. Slippage guard
  if (args.slippageBps !== undefined && args.slippageBps > MAX_SLIPPAGE_BPS) {
    return {
      decision: 'block',
      userMessage: `⚠️ Slippage of ${(args.slippageBps / 100).toFixed(1)}% is too high. Maximum is ${MAX_SLIPPAGE_BPS / 100}%. Try again with a lower slippage setting.`,
      audit: {
        hook: 'swap-guard',
        decision: 'block',
        reason: 'slippage_too_high',
        meta: { slippageBps: args.slippageBps, maxBps: MAX_SLIPPAGE_BPS },
      },
    };
  }

  // 4. Confirmation threshold
  const amountUsd = args.amountUsd ?? 0;
  if (amountUsd > CONFIRM_THRESHOLD_USD) {
    return {
      decision: 'confirm_required',
      userMessage: `💸 You're about to swap ~$${amountUsd.toFixed(2)} on devnet.\n\nConfirm to proceed:`,
      audit: {
        hook: 'swap-guard',
        decision: 'confirm_required',
        reason: 'amount_above_threshold',
        meta: { amountUsd, threshold: CONFIRM_THRESHOLD_USD },
      },
    };
  }

  return {
    decision: 'allow',
    audit: {
      hook: 'swap-guard',
      decision: 'allow',
      reason: 'swap_within_limits',
      meta: { amountUsd, network: args.network ?? TRIAL_NETWORK },
    },
  };
}
