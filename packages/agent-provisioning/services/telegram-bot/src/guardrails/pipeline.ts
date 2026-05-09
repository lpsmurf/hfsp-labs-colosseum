/**
 * Poly Guardrails — Pipeline Orchestrator
 *
 * Assembles all 9 hooks into the correct execution order.
 *
 * Execution order:
 *
 *   ONBOARDING (runs first, before everything)
 *     0. onboardingHook         — email CTA gate, blocks until email verified
 *
 *   INTAKE (before agent brain)
 *     1. inputValidationHook    — sanitise raw user input (max 500 chars)
 *     2. rateLimiterHook        — sliding window rate limit
 *     3. authGuardHook          — paired + active subscription + credits check
 *
 *   TOOL CALL (before each MCP call, may run 1–5 times per message)
 *     4. toolAllowlistHook      — POLY_TOOLS whitelist (15 tools only)
 *     5. swapGuardHook          — financial guardrails + mainnet block
 *     6. executionTimeoutHook   — tool count + elapsed time cap
 *
 *   OUTPUT (before sending response to Telegram)
 *     7. outputSanitizerHook    — strip keys, PII, bad links
 *     8. creditGuardHook        — low-balance warning / depletion block
 */

import { createLogger } from '../utils/logger.js';
import type { GuardrailContext, GuardrailResult } from './types.js';

import { onboardingHook }       from './00-onboarding.js';
import { inputValidationHook }  from './01-input-validation.js';
import { rateLimiterHook }      from './02-rate-limiter.js';
import { authGuardHook }        from './03-auth-guard.js';
import { toolAllowlistHook }    from './04-tool-allowlist.js';
import { swapGuardHook }        from './05-swap-guard.js';
import { executionTimeoutHook, clearExecutionState } from './06-execution-timeout.js';
import { outputSanitizerHook }  from './07-output-sanitizer.js';
import { creditGuardHook }      from './08-credit-guard.js';

const logger = createLogger();

export interface PipelineResult {
  allowed: boolean;
  /** Send this to the user if allowed === false */
  userMessage?: string;
  /** The final cleaned text to send if allowed === true */
  sanitizedText?: string;
  /** Low-balance notice to append to the response (non-blocking) */
  notice?: string;
  /** Full audit trail for all hooks that ran */
  audit: GuardrailResult['audit'][];
}

/**
 * Run onboarding gate first — before ANY other hook.
 * Returns early if user needs to complete onboarding.
 */
export async function runOnboardingGate(ctx: GuardrailContext): Promise<PipelineResult> {
  const result = await onboardingHook(ctx);
  return {
    allowed: result.decision === 'allow',
    userMessage: result.userMessage,
    audit: [result.audit],
  };
}

/**
 * Run all intake hooks (before calling the agent brain).
 * Returns early on first block.
 */
export async function runIntakeGuardrails(ctx: GuardrailContext): Promise<PipelineResult> {
  const audit: GuardrailResult['audit'][] = [];

  for (const hook of [inputValidationHook, rateLimiterHook, authGuardHook]) {
    const result = await hook(ctx);
    audit.push(result.audit);

    if (result.decision === 'block') {
      logger.warn({ hook: result.audit.hook, reason: result.audit.reason, chatId: ctx.chatId }, 'Intake blocked');
      return { allowed: false, userMessage: result.userMessage, audit };
    }
  }

  return { allowed: true, audit };
}

/**
 * Run all tool-call hooks (before each individual MCP tool execution).
 * Returns early on first block or confirm_required.
 */
export async function runToolGuardrails(ctx: GuardrailContext): Promise<PipelineResult> {
  const audit: GuardrailResult['audit'][] = [];

  for (const hook of [toolAllowlistHook, swapGuardHook, executionTimeoutHook]) {
    const result = await hook(ctx);
    audit.push(result.audit);

    if (result.decision === 'block') {
      logger.warn({ hook: result.audit.hook, reason: result.audit.reason, chatId: ctx.chatId }, 'Tool call blocked');
      return { allowed: false, userMessage: result.userMessage, audit };
    }

    if (result.decision === 'confirm_required') {
      logger.info({ hook: result.audit.hook, chatId: ctx.chatId }, 'Tool call requires confirmation');
      return { allowed: false, userMessage: result.userMessage, audit };
    }
  }

  return { allowed: true, audit };
}

/**
 * Run all output hooks (after agent brain produces a response).
 * Always produces a sanitized text — never hard-blocks silently.
 */
export async function runOutputGuardrails(
  ctx: GuardrailContext,
  rawResponse: string,
): Promise<PipelineResult> {
  const audit: GuardrailResult['audit'][] = [];
  let text = rawResponse;
  let notice: string | undefined;

  // 7. Output sanitizer
  const sanitizerCtx: GuardrailContext = { ...ctx, agentResponse: text };
  const sanitizerResult = await outputSanitizerHook(sanitizerCtx);
  audit.push(sanitizerResult.audit);
  text = sanitizerResult.sanitizedText ?? text;

  // 8. Credit guard
  const creditResult = await creditGuardHook(ctx);
  audit.push(creditResult.audit);

  if (creditResult.decision === 'block') {
    clearExecutionState(ctx);
    return { allowed: false, userMessage: creditResult.userMessage, audit };
  }

  if (creditResult.sanitizedText) {
    notice = creditResult.sanitizedText;
  }

  clearExecutionState(ctx);

  return { allowed: true, sanitizedText: text, notice, audit };
}

/**
 * Full pipeline for a regular message (no tool calls).
 * Onboarding → Intake → Output.
 */
export async function runFullPipeline(
  ctx: GuardrailContext,
  rawResponse: string,
): Promise<PipelineResult> {
  const onboarding = await runOnboardingGate(ctx);
  if (!onboarding.allowed) return onboarding;

  const intake = await runIntakeGuardrails(ctx);
  if (!intake.allowed) return intake;

  return runOutputGuardrails(ctx, rawResponse);
}
