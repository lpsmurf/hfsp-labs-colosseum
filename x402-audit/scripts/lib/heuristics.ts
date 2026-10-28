/**
 * Regex heuristics shared by security-probe.ts and the triage eval.
 * Extracted verbatim so the eval measures exactly what the scanner does.
 */

// Secrets / sensitive markers that should NEVER appear in a 402 or error body.
export const SECRET_PATTERNS: Array<[string, RegExp]> = [
  // NOTE: a bare 64-hex heuristic was removed — it false-positives on tx
  // hashes, signatures, and 32-byte content hashes that legitimately appear
  // in 402 bodies. Only match high-confidence secret formats below.
  ['solana_secret_arr', /\[\s*\d{1,3}\s*(,\s*\d{1,3}\s*){31,}\]/], // [12,34,...] keypair array
  ['aws_key',           /AKIA[0-9A-Z]{16}/],
  ['openai_key',        /sk-[A-Za-z0-9]{20,}/],
  ['jwt',               /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['stripe_secret',     /sk_live_[A-Za-z0-9]{16,}/], // pk_live_ is a PUBLISHABLE key (public by design) — not a leak
  ['internal_ip',       /\b(10\.\d{1,3}|192\.168|172\.(1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/],
];

// NOTE: bare filesystem paths ('/home/', '/usr/src/app') were REMOVED — they
// false-positive on ordinary content/URLs (e.g. a "HomePulse" service whose
// resource URL contains '/home/'). Keep only high-confidence trace signatures.
export const STACKTRACE_MARKERS = [
  'at Object.', 'at Module.', 'Traceback (most recent call last)',
  'java.lang.', 'System.Exception', 'goroutine ', 'panic:',
  'webpack-internal', '\n    at ', // V8 stack frame: newline + indent + "at "
];

export function scanSecrets(text: string): string[] {
  const hits: string[] = [];
  for (const [name, re] of SECRET_PATTERNS) {
    if (re.test(text)) hits.push(name);
  }
  return hits;
}

export function hasStackTrace(text: string): boolean {
  return STACKTRACE_MARKERS.some(m => text.includes(m));
}

/**
 * A GET that returns a MANIFEST / landing page / docs / agent card is
 * expected, NOT a bypass. Across 744 services this heuristic produced ONLY
 * false positives: GET universally serves discovery content (JSON manifest,
 * HTML landing page, markdown docs, agent card, or "POST here" help text)
 * while the paid route is POST-gated. We treat all of those as discovery.
 */
export function isDiscoveryDoc(body: string, contentType: string): boolean {
  const b = body.slice(0, 600);
  const isHtmlOrMarkdown = /^\s*<!doctype|^\s*<html|text\/html|text\/markdown/i.test(contentType + '\n' + b);
  const isHelpText = /send\s+a?\s*POST|this\s+is\s+a\s+POST\s+endpoint|"name"\s*:|"description"\s*:|POST\s+\/?\s*[—-]\s*\$/i.test(b);
  const isManifest = /"\$schema"|agent\s*card|"protocol"\s*:\s*"(A2A|mcp)"|openapi|"x402Version"|"accepts"\s*:|"price"\s*:|"price_per_call"\s*:|"method"\s*:\s*"POST"|"pay_to"\s*:|"atomic_amount"\s*:|"network_caip"\s*:/i.test(b);
  return isManifest || isHtmlOrMarkdown || isHelpText;
}

/** The first substring any secret pattern matches (for triage context). */
export function firstSecretMatch(text: string): string | undefined {
  for (const [, re] of SECRET_PATTERNS) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return undefined;
}
