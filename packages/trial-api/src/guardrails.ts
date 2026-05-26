// Guardrails for the Poly free-trial web chatbot.
// Input: injection check. Output: strip keys, PII, phishing links.

const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all )?(previous|prior|above) instructions/i,
  /you are now (a |an )?(?!poly)/i,
  /disregard (your|all) (rules|guidelines|constraints)/i,
  /act as if you (have no|don't have) restrictions/i,
  /\[system\]|\[assistant\]|\[user\]/i,
  /###\s*(system|instruction|override)/i,
  /<\|im_start\|>|<\|im_end\|>/i,
];

export interface InputCheckResult {
  ok: boolean;
  error?: string;
}

export function checkInput(message: string): InputCheckResult {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(message)) {
      return {
        ok: false,
        error: "I can't process that kind of instruction. Ask me about prices, swaps, or your Solana portfolio.",
      };
    }
  }
  return { ok: true };
}

interface SanitizerRule {
  pattern: RegExp;
  replacement: string;
}

const SANITIZER_RULES: SanitizerRule[] = [
  // Solana private keys (64-char hex)
  { pattern: /\b[0-9a-fA-F]{64}\b/g, replacement: '[REDACTED_KEY]' },
  // Base58 private keys (87-88 chars)
  { pattern: /\b[1-9A-HJ-NP-Za-km-z]{87,88}\b/g, replacement: '[REDACTED_KEY]' },
  // Known API key prefixes
  { pattern: /sk-or-[a-zA-Z0-9\-_]{20,}/g, replacement: '[REDACTED_KEY]' },
  { pattern: /sk-ant-[a-zA-Z0-9\-_]{20,}/g, replacement: '[REDACTED_KEY]' },
  // key=value / key: value patterns
  { pattern: /(api[_-]?key|secret|bearer)\s*[:=]\s*\S+/gi, replacement: '$1: [REDACTED]' },
  // Seed phrases (12 or 24 word sequences)
  { pattern: /\b(\w+\s){11}\w+\b|\b(\w+\s){23}\w+\b/g, replacement: '[REDACTED_SEED]' },
  // Phishing URLs — allow only known safe domains
  {
    pattern: /https?:\/\/(?!solscan\.io|jup\.ag|birdeye\.so|dexscreener\.com|coingecko\.com|helius\.dev|clawdrop\.live)[^\s<>"]{10,}/g,
    replacement: '[LINK_REMOVED]',
  },
];

const SAFE_FALLBACK = "I found the information but can't display it safely. Please check your wallet directly on Solscan.";

export function sanitizeChunk(text: string): string {
  let out = text;
  for (const rule of SANITIZER_RULES) {
    out = out.replace(rule.pattern, rule.replacement);
  }
  return out;
}

export function sanitizeOutput(text: string): string {
  if (!text.trim()) return SAFE_FALLBACK;

  const out = sanitizeChunk(text);

  // If sanitization stripped almost everything, return fallback
  const remaining = out.replace(/\[REDACTED[^\]]*\]|\[LINK_REMOVED\]/g, '').trim();
  if (remaining.length < 20) return SAFE_FALLBACK;

  return out;
}
