/**
 * Hook 1 — Input Validation
 *
 * Intercepts: BEFORE message reaches the agent brain.
 * Blocks:
 *   - Messages over 2,000 chars (token bomb protection)
 *   - Known prompt injection patterns
 *   - Non-UTF-8 / binary content
 *   - Empty or whitespace-only input
 */

import { GuardrailContext, GuardrailResult } from './types.js';

const MAX_MESSAGE_LENGTH = 500;

/**
 * Patterns that indicate attempted prompt injection.
 * Conservative — only block clear attacks, not edge cases.
 */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all )?(previous|prior|above) instructions/i,
  /you are now (a |an )?(?!poly)/i,           // "you are now DAN", "you are now unrestricted"
  /disregard (your|all) (rules|guidelines|constraints)/i,
  /act as if you (have no|don't have) restrictions/i,
  /\[system\]|\[assistant\]|\[user\]/i,        // role injection via brackets
  /###\s*(system|instruction|override)/i,
  /<\|im_start\|>|<\|im_end\|>/i,             // OpenAI special tokens
];

export async function inputValidationHook(ctx: GuardrailContext): Promise<GuardrailResult> {
  const { messageText } = ctx;

  // 1. Empty check
  if (!messageText || !messageText.trim()) {
    return {
      decision: 'block',
      userMessage: "I didn't catch that — send me a message and I'll get right on it.",
      audit: { hook: 'input-validation', decision: 'block', reason: 'empty_message' },
    };
  }

  // 2. Length bomb
  if (messageText.length > MAX_MESSAGE_LENGTH) {
    return {
      decision: 'block',
      userMessage: `Message too long (${messageText.length} chars). Please keep it under ${MAX_MESSAGE_LENGTH} characters.`,
      audit: {
        hook: 'input-validation',
        decision: 'block',
        reason: 'message_too_long',
        meta: { length: messageText.length },
      },
    };
  }

  // 3. UTF-8 / binary check
  try {
    // If encoding is wrong, Buffer round-trip will diverge
    const roundTrip = Buffer.from(messageText, 'utf8').toString('utf8');
    if (roundTrip !== messageText) {
      return {
        decision: 'block',
        userMessage: 'Sorry, I can only read plain text messages.',
        audit: { hook: 'input-validation', decision: 'block', reason: 'invalid_encoding' },
      };
    }
  } catch {
    return {
      decision: 'block',
      userMessage: 'Sorry, I can only read plain text messages.',
      audit: { hook: 'input-validation', decision: 'block', reason: 'encoding_error' },
    };
  }

  // 4. Prompt injection
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(messageText)) {
      return {
        decision: 'block',
        userMessage: "I can't process that kind of instruction. Ask me about prices, swaps, or your portfolio instead.",
        audit: {
          hook: 'input-validation',
          decision: 'block',
          reason: 'prompt_injection',
          meta: { pattern: pattern.source },
        },
      };
    }
  }

  return {
    decision: 'allow',
    audit: { hook: 'input-validation', decision: 'allow', reason: 'passed_all_checks' },
  };
}
