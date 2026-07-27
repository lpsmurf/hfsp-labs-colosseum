import type { RepoFile } from '../github.js';
import type { Finding, Severity } from '../report.js';

// ─────────────────────────────────────────────────────────────────────────────
// Secret detection — gitleaks-inspired ruleset + Shannon-entropy fallback.
//
// Ported from the high-signal subset of gitleaks' default TOML rules
// (https://github.com/gitleaks/gitleaks) so the in-memory scanner gains
// broad provider coverage without requiring the gitleaks binary at runtime.
// When the binary IS available, engines/external.ts runs the full ruleset too.
// ─────────────────────────────────────────────────────────────────────────────

interface SecretRule {
  id:        string;
  re:        RegExp;
  label:     string;
  severity:  Severity;
  /** Optional: only flag the captured group if its Shannon entropy ≥ this. */
  entropy?:  number;
  /** Which capture group holds the secret (default: 1, else whole match). */
  group?:    number;
  /**
   * Optional: require this pattern within the ~80 chars preceding the match.
   * Used to disambiguate raw hex/base58 secrets (private keys) from the many
   * benign 0x-hashes, tx signatures, and addresses that share their shape.
   */
  context?:  RegExp;
  /**
   * Optional: SKIP the match if this pattern appears in the ~80 preceding chars.
   * Used to exclude values assigned to tx/sig/hash/address-named variables.
   */
  antiContext?: RegExp;
}

const SECRET_RULES: SecretRule[] = [
  // ── Cloud providers ────────────────────────────────────────────────────────
  { id: 'GL-AWS-AKID',    re: /\b(AKIA[0-9A-Z]{16})\b/g,                                  label: 'AWS Access Key ID',            severity: 'CRITICAL' },
  { id: 'GL-AWS-SECRET',  re: /aws.{0,20}?['"]([0-9a-zA-Z/+]{40})['"]/gi,                 label: 'AWS Secret Access Key',        severity: 'CRITICAL', entropy: 3.5 },
  { id: 'GL-GCP-APIKEY',  re: /\b(AIza[0-9A-Za-z\-_]{35})\b/g,                            label: 'Google API key',               severity: 'HIGH' },
  { id: 'GL-GCP-OAUTH',   re: /\b(ya29\.[0-9A-Za-z\-_]+)\b/g,                             label: 'Google OAuth access token',    severity: 'HIGH' },
  { id: 'GL-GCP-SAKEY',   re: /"private_key"\s*:\s*"-----BEGIN PRIVATE KEY-----/g,        label: 'GCP service-account private key', severity: 'CRITICAL', group: 0 },

  // ── Source / package hosts ───────────────────────────────────────────────────
  { id: 'GL-GH-PAT',      re: /\b((?:ghp|gho|ghu|ghs|ghr)_[0-9A-Za-z]{36})\b/g,          label: 'GitHub personal access token', severity: 'CRITICAL' },
  { id: 'GL-GH-FINEPAT',  re: /\b(github_pat_[0-9A-Za-z_]{82})\b/g,                       label: 'GitHub fine-grained PAT',      severity: 'CRITICAL' },
  { id: 'GL-GITLAB-PAT',  re: /\b(glpat-[0-9A-Za-z\-_]{20})\b/g,                          label: 'GitLab personal access token', severity: 'CRITICAL' },
  { id: 'GL-NPM',         re: /\b(npm_[0-9A-Za-z]{36})\b/g,                               label: 'npm access token',             severity: 'HIGH' },

  // ── Messaging / comms ────────────────────────────────────────────────────────
  { id: 'GL-SLACK-TOKEN', re: /\b(xox[baprs]-[0-9A-Za-z-]{10,48})\b/g,                    label: 'Slack token',                  severity: 'HIGH' },
  { id: 'GL-SLACK-HOOK',  re: /(https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9+/]{40,})/g, label: 'Slack webhook URL',        severity: 'MEDIUM', group: 1 },
  { id: 'GL-DISCORD-HOOK',re: /(https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/[0-9]+\/[A-Za-z0-9_-]+)/g, label: 'Discord webhook URL', severity: 'MEDIUM', group: 1 },
  { id: 'GL-TELEGRAM',    re: /\b([0-9]{8,10}:AA[0-9A-Za-z_-]{33})\b/g,                   label: 'Telegram bot token',           severity: 'HIGH' },
  { id: 'GL-SENDGRID',    re: /\b(SG\.[0-9A-Za-z\-_]{22}\.[0-9A-Za-z\-_]{43})\b/g,        label: 'SendGrid API key',             severity: 'HIGH' },
  { id: 'GL-TWILIO',      re: /\b(SK[0-9a-fA-F]{32})\b/g,                                 label: 'Twilio API key',               severity: 'HIGH' },

  // ── Payments / AI ────────────────────────────────────────────────────────────
  { id: 'GL-STRIPE-LIVE', re: /\b((?:sk|rk)_live_[0-9a-zA-Z]{20,})\b/g,                   label: 'Stripe live secret key',       severity: 'CRITICAL' },
  { id: 'GL-OPENAI',      re: /\b(sk-(?:proj-)?[0-9A-Za-z\-_]{40,})\b/g,                  label: 'OpenAI API key',               severity: 'HIGH' },
  { id: 'GL-ANTHROPIC',   re: /\b(sk-ant-[0-9A-Za-z\-_]{90,})\b/g,                        label: 'Anthropic API key',            severity: 'HIGH' },

  // ── Private keys (crypto wallets + PEM) ──────────────────────────────────────
  // The raw hex/base58/word-list shapes also match tx hashes, event-topic
  // hashes, block hashes, addresses and tx signatures — so they require a
  // key-ish keyword nearby to avoid flagging every 0x-hash as a leaked key.
  // Real leaked PEM is followed by base64 key bytes; a `${...}` right after the
  // header is a keygen template producing a key at runtime, not a hardcoded one.
  { id: 'GL-PEM',         re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----(?!\\n\$\{|\$\{|"\s*\+|\s*\$\{)/g, label: 'PEM private key block',    severity: 'CRITICAL', group: 0 },
  { id: 'GL-SOL-KEY',     re: /['"` ]([1-9A-HJ-NP-Za-km-z]{87,88})['"` ]/g,              label: 'Possible Solana private key (base58)', severity: 'CRITICAL', context: /priv|secret|seed|mnemonic|wallet|signer|keypair|fromSecretKey|bs58/i, antiContext: /(?:tx|sig|hash|addr|address|pubkey|signature|txn)\b\s*[:=]/i },
  { id: 'GL-EVM-KEY',     re: /\b(0x[0-9a-fA-F]{64})\b/g,                                 label: 'Possible EVM private key (hex)', severity: 'CRITICAL', context: /priv|secret|seed|mnemonic|wallet|signer|keypair|new Wallet/i, antiContext: /(?:tx|sig|hash|addr|address|topic|signature|txn)\b\s*[:=]/i },
  { id: 'GL-MNEMONIC',    re: /\b((?:[a-z]{3,8}\s+){11,23}[a-z]{3,8})\b/g,               label: 'Possible BIP-39 mnemonic seed phrase', severity: 'CRITICAL', entropy: 3.0, context: /mnemonic|seed|phrase|wallet|recovery|bip.?39/i },

  // ── Generic high-entropy assignments ─────────────────────────────────────────
  { id: 'GL-GENERIC-KEY', re: /(?:api[_-]?key|secret|token|password|passwd|client[_-]?secret)\s*[:=]\s*['"]([0-9A-Za-z\-_/+=.]{24,})['"]/gi, label: 'Generic high-entropy secret assignment', severity: 'HIGH', entropy: 3.7 },
  { id: 'GL-JWT',         re: /\b(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g, label: 'JSON Web Token (JWT)', severity: 'MEDIUM', entropy: 3.5 },
  { id: 'GL-PRIVKEY-ENV', re: /(?:PRIVATE_KEY|SECRET_KEY|MNEMONIC|SEED_PHRASE)\s*=\s*["']?([^\s"'${}#]{30,})/g, label: 'Wallet/secret env var assigned a real value', severity: 'CRITICAL' },
];

// Files where real-looking secrets are expected / acceptable.
const SAFE_FILES = /\.env\.example$|\.env\.sample$|\.env\.template$|README|\.md$|\.test\.|\.spec\.|fixtures?\/|mocks?\/|node_modules|package-lock\.json|yarn\.lock|pnpm-lock/i;

// Obvious placeholders + env-var reads (never a hardcoded secret) — skip these.
const PLACEHOLDER = /your[_-]?(?:key|secret|token|wallet)|<[^>]+>|\$\{|process\.env|import\.meta\.env|xxx+|redact|placeholder|changeme|example|todo|dummy|sample|0{16,}|1234567|abcdef0/i;

/** Shannon entropy (bits/char) of a string — used to suppress low-entropy false positives. */
export function shannonEntropy(s: string): number {
  if (!s) return 0;
  const freq: Record<string, number> = {};
  for (const ch of s) freq[ch] = (freq[ch] ?? 0) + 1;
  let h = 0;
  for (const c of Object.values(freq)) {
    const p = c / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

// A match sitting inside a regex-rule definition (e.g. this very file, or any
// other secret scanner) is the scanner detecting its own patterns — skip it.
function isInRuleDefinition(content: string, index: number): boolean {
  const lineStart = content.lastIndexOf('\n', index) + 1;
  let lineEnd = content.indexOf('\n', index);
  if (lineEnd === -1) lineEnd = content.length;
  const line = content.slice(lineStart, lineEnd);
  return /\bre:\s*\/|new RegExp\(|RegExp\(|\/[^/\n]*\\b|label:\s*['"]/.test(line);
}

export function checkSecrets(file: RepoFile): Finding[] {
  const findings: Finding[] = [];
  const { path, content } = file;

  if (SAFE_FILES.test(path)) return findings;

  for (const rule of SECRET_RULES) {
    let m: RegExpExecArray | null;
    rule.re.lastIndex = 0;
    while ((m = rule.re.exec(content)) !== null) {
      const matched = (rule.group === 0 ? m[0] : m[rule.group ?? 1]) ?? m[0];
      if (PLACEHOLDER.test(matched)) continue;
      if (rule.entropy !== undefined && shannonEntropy(matched) < rule.entropy) continue;
      if (rule.context || rule.antiContext) {
        const before = content.slice(Math.max(0, m.index - 80), m.index);
        if (rule.context && !rule.context.test(before)) continue;
        if (rule.antiContext && rule.antiContext.test(before)) continue;
      }
      if (isInRuleDefinition(content, m.index)) continue;

      findings.push({
        id:       rule.id,
        severity: rule.severity,
        title:    `Hardcoded secret detected: ${rule.label}`,
        detail:   `A value matching the "${rule.label}" pattern is hardcoded in \`${path}\`. If this is a live credential it is exposed to anyone with repo access and must be rotated.`,
        location: path,
        fix:      'Move the secret to an environment variable, rotate the exposed credential immediately, purge it from git history (e.g. `git filter-repo`), and add the file to .gitignore.',
      });
      break; // one finding per rule per file is enough
    }
    rule.re.lastIndex = 0;
  }

  return findings;
}
