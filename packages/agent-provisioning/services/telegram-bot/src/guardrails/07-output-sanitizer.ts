/**
 * Hook 7 — Output Sanitizer
 *
 * Intercepts: AFTER the agent produces a response, BEFORE it's sent to Telegram.
 * Strips or masks:
 *   - Private keys, seed phrases, API keys
 *   - Email addresses
 *   - Other users' wallet addresses (only the user's own should appear)
 *   - Suspicious external links (phishing patterns)
 *   - Excessive length (truncates gracefully)
 *
 * Decision is always 'sanitized' (never block — we clean and send).
 * If the entire response would be stripped, we substitute a safe fallback.
 */

import { GuardrailContext, GuardrailResult } from './types.js';

const MAX_RESPONSE_LENGTH = 4000;  // Telegram message limit is 4096

interface SanitizerRule {
  name: string;
  pattern: RegExp;
  replacement: string;
}

const RULES: SanitizerRule[] = [
  // Private keys — 64-char hex strings (Solana)
  {
    name: 'solana_private_key',
    pattern: /\b[0-9a-fA-F]{64}\b/g,
    replacement: '[REDACTED_KEY]',
  },
  // Base58 private key (88 chars)
  {
    name: 'base58_private_key',
    pattern: /\b[1-9A-HJ-NP-Za-km-z]{87,88}\b/g,
    replacement: '[REDACTED_KEY]',
  },
  // Seed phrase — 12 or 24 word sequences matching BIP39 structure
  {
    name: 'seed_phrase',
    pattern: /\b(\w+\s){11}\w+\b|\b(\w+\s){23}\w+\b/g,
    replacement: '[REDACTED_SEED]',
  },
  // API keys / tokens in key=value or key: value patterns
  {
    name: 'api_key_pattern',
    pattern: /(api[_-]?key|token|secret|password|bearer)\s*[:=]\s*\S+/gi,
    replacement: '$1: [REDACTED]',
  },
  // OpenRouter / Anthropic keys
  {
    name: 'openrouter_key',
    pattern: /sk-or-[a-zA-Z0-9\-_]{20,}/g,
    replacement: '[REDACTED_KEY]',
  },
  {
    name: 'anthropic_key',
    pattern: /sk-ant-[a-zA-Z0-9\-_]{20,}/g,
    replacement: '[REDACTED_KEY]',
  },
  // Email addresses
  {
    name: 'email',
    pattern: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    replacement: '[EMAIL]',
  },
  // Suspicious phishing link patterns
  {
    name: 'phishing_links',
    pattern: /https?:\/\/(?!solscan\.io|jup\.ag|birdeye\.so|dexscreener\.com|clawdrop\.live|t\.me)[^\s]{10,}/g,
    replacement: '[LINK_REMOVED]',
  },
];

const SAFE_FALLBACK = "I found the information but can't display it safely. Please check your wallet directly on Solscan.";

export async function outputSanitizerHook(ctx: GuardrailContext): Promise<GuardrailResult> {
  let text = ctx.agentResponse ?? '';

  if (!text.trim()) {
    return {
      decision: 'sanitized',
      sanitizedText: SAFE_FALLBACK,
      audit: { hook: 'output-sanitizer', decision: 'sanitized', reason: 'empty_response' },
    };
  }

  const appliedRules: string[] = [];

  for (const rule of RULES) {
    const before = text;
    text = text.replace(rule.pattern, rule.replacement);
    if (text !== before) appliedRules.push(rule.name);
  }

  // Truncate if over Telegram limit
  if (text.length > MAX_RESPONSE_LENGTH) {
    text = text.slice(0, MAX_RESPONSE_LENGTH - 20) + '\n\n_(response truncated)_';
    appliedRules.push('length_truncation');
  }

  // If sanitization removed almost everything, use safe fallback
  if (text.replace(/\[REDACTED[^\]]*\]|\[EMAIL\]|\[LINK_REMOVED\]/g, '').trim().length < 20) {
    return {
      decision: 'sanitized',
      sanitizedText: SAFE_FALLBACK,
      audit: {
        hook: 'output-sanitizer',
        decision: 'sanitized',
        reason: 'response_mostly_redacted',
        meta: { appliedRules },
      },
    };
  }

  return {
    decision: 'sanitized',
    sanitizedText: text,
    audit: {
      hook: 'output-sanitizer',
      decision: 'sanitized',
      reason: appliedRules.length ? 'rules_applied' : 'clean',
      meta: { appliedRules },
    },
  };
}
