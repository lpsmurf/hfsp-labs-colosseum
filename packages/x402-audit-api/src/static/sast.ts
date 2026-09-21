import type { RepoFile } from '../github.js';
import type { Finding, Severity } from '../report.js';

// ─────────────────────────────────────────────────────────────────────────────
// Lightweight SAST — OWASP Top 10 / CWE-Top-25 heuristics for JS/TS services.
//
// Inspired by Bearer (https://github.com/bearer/bearer) and the ECC
// security-review checklist (https://github.com/affaan-m/ECC). These are
// regex/heuristic detectors tuned for the Node + x402 server context. They
// favour high signal — each rule maps to a concrete CWE and a remediation.
// ─────────────────────────────────────────────────────────────────────────────

interface SastRule {
  id:       string;
  re:       RegExp;
  title:    string;
  cwe:      string;
  severity: Severity;
  detail:   string;
  fix:      string;
  /** Optional negative lookahead signal — if present in the file, downgrade/skip. */
  mitigatedBy?: RegExp;
}

const RULES: SastRule[] = [
  {
    id: 'SAST-SQLI-001',
    re: /\.(?:query|raw|execute)\s*\(\s*[`'"][^`'"]*\$\{/g,
    title: 'Possible SQL injection — interpolated query string',
    cwe: 'CWE-89',
    severity: 'HIGH',
    detail: 'A database query is built with template-literal interpolation. User-controlled values concatenated into SQL allow injection.',
    fix: 'Use parameterized queries / prepared statements ($1, ? placeholders) or an ORM query builder. Never interpolate untrusted input into SQL.',
  },
  {
    id: 'SAST-CMDI-001',
    re: /(?:exec|execSync|spawn|spawnSync)\s*\(\s*[`'"][^`'"]*\$\{|child_process[\s\S]{0,40}exec\s*\([^)]*\+/g,
    title: 'Possible command injection — shell call with interpolation',
    cwe: 'CWE-78',
    severity: 'CRITICAL',
    detail: 'A child_process exec/spawn call includes interpolated or concatenated input. Untrusted values reaching a shell allow arbitrary command execution.',
    fix: 'Use execFile/spawn with an argument array (no shell), validate/allowlist arguments, and never pass user input through a shell string.',
  },
  {
    id: 'SAST-SSRF-001',
    // Only fire when request input appears INSIDE the request URL argument —
    // not when a hardcoded base URL has an interpolated path (the common,
    // benign case e.g. fetch(`${HELIUS_URL}/tx/${sig}`)).
    re: /(?:fetch|axios(?:\.get|\.post|\.request)?|got|http\.get|https\.get|request)\s*\(\s*[^)]{0,160}req\.(?:body|query|params|headers)/g,
    title: 'Possible SSRF — outbound request to a user-controlled URL',
    cwe: 'CWE-918',
    severity: 'HIGH',
    detail: 'An outbound HTTP request target is derived directly from request input. An attacker can pivot to internal services, cloud metadata (169.254.169.254), or localhost.',
    fix: 'Allowlist destination hosts/schemes, resolve and reject private/loopback/link-local IPs before connecting, and disable redirects to untrusted hosts.',
  },
  {
    id: 'SAST-CRYPTO-001',
    re: /createHash\s*\(\s*['"](?:md5|sha1)['"]\s*\)/g,
    title: 'Weak hash algorithm (MD5/SHA-1)',
    cwe: 'CWE-327',
    severity: 'MEDIUM',
    detail: 'MD5/SHA-1 are cryptographically broken and unsuitable for signatures, password hashing, or integrity of security-sensitive data.',
    fix: 'Use SHA-256+ for integrity, HMAC-SHA256 for signatures, and a memory-hard KDF (bcrypt/scrypt/argon2) for passwords.',
  },
  {
    id: 'SAST-CRYPTO-002',
    // Drop bare "id" — Math.random() for toast/list ids is benign and was the
    // dominant false positive. Only flag genuinely security-sensitive values.
    re: /Math\.random\s*\(\s*\)[\s\S]{0,60}(?:token|secret|nonce|otp|session|api[_-]?key|password|salt|private)/gi,
    title: 'Insecure randomness for a security value',
    cwe: 'CWE-338',
    severity: 'HIGH',
    detail: 'Math.random() is not cryptographically secure. Using it for tokens, nonces, OTPs, or session ids makes them predictable.',
    fix: 'Use crypto.randomBytes() / crypto.randomUUID() / crypto.getRandomValues() for any security-relevant value.',
  },
  {
    id: 'SAST-EVAL-001',
    re: /\beval\s*\(|new\s+Function\s*\(|vm\.runIn(?:New|This)Context/g,
    title: 'Dynamic code execution (eval / new Function)',
    cwe: 'CWE-95',
    severity: 'HIGH',
    detail: 'Dynamic code evaluation of any value influenced by input leads to remote code execution.',
    fix: 'Remove eval/new Function. Parse data with JSON.parse, dispatch via a lookup map, and never execute strings.',
  },
  {
    id: 'SAST-PATH-001',
    re: /(?:readFile(?:Sync)?|createReadStream|sendFile|readdir(?:Sync)?)\s*\(\s*(?:`[^`]*\$\{|[^),]*req\.(?:body|query|params))/g,
    title: 'Possible path traversal — filesystem access from request input',
    cwe: 'CWE-22',
    severity: 'HIGH',
    detail: 'A filesystem path is built from request input. `../` sequences can escape the intended directory and read arbitrary files.',
    fix: 'Resolve the path and assert it stays within a fixed base dir (path.resolve(base, p).startsWith(base)); allowlist filenames; reject `..`.',
  },
  {
    id: 'SAST-JWT-LOCALSTORAGE',
    re: /localStorage\.setItem\s*\(\s*['"](?:token|jwt|auth|access[_-]?token|session)['"]/gi,
    title: 'Auth token stored in localStorage (XSS-exfiltratable)',
    cwe: 'CWE-922',
    severity: 'MEDIUM',
    detail: 'Tokens in localStorage are readable by any script on the page, so a single XSS leaks the session.',
    fix: 'Store session tokens in HttpOnly, Secure, SameSite cookies set by the server, not in localStorage.',
  },
  {
    id: 'SAST-TLS-DISABLED',
    re: /NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0|rejectUnauthorized\s*:\s*false/g,
    title: 'TLS certificate verification disabled',
    cwe: 'CWE-295',
    severity: 'HIGH',
    detail: 'Disabling TLS verification allows man-in-the-middle attackers to intercept traffic, including credentials and payments.',
    fix: 'Remove rejectUnauthorized:false / NODE_TLS_REJECT_UNAUTHORIZED=0. Trust the proper CA or pin the cert instead.',
  },
  {
    id: 'SAST-JWT-NONE',
    re: /algorithms?\s*:\s*\[?\s*['"]none['"]|jwt\.decode\s*\([^)]*\)(?![\s\S]{0,80}verify)/g,
    title: 'JWT verified with "none" / decoded without verification',
    cwe: 'CWE-347',
    severity: 'CRITICAL',
    detail: 'Accepting the "none" algorithm, or using jwt.decode() in place of jwt.verify(), lets an attacker forge tokens.',
    fix: 'Always jwt.verify() with an explicit allowlist of strong algorithms (e.g. ["HS256"] or ["RS256"]); never accept "none".',
  },
  {
    id: 'SAST-OPEN-REDIRECT',
    re: /res\.redirect\s*\(\s*(?:`[^`]*\$\{|[^),]*req\.(?:body|query|params))/g,
    title: 'Possible open redirect — redirect target from request input',
    cwe: 'CWE-601',
    severity: 'MEDIUM',
    detail: 'A redirect target taken from request input enables phishing via attacker-controlled destinations.',
    fix: 'Redirect only to a fixed allowlist of relative paths/hosts; reject absolute URLs to other origins.',
  },
];

// Skip non-source and vendored files.
const SKIP = /node_modules|\.lock$|package-lock\.json|yarn\.lock|pnpm-lock|\.min\.(?:js|css)$|dist\//;

export function runSast(file: RepoFile): Finding[] {
  const findings: Finding[] = [];
  const { path, content } = file;

  if (SKIP.test(path)) return findings;
  if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(path)) return findings;

  const isTest = /\.(test|spec)\.|__tests__|\.stories\./.test(path);

  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    if (!rule.re.test(content)) continue;
    rule.re.lastIndex = 0;
    if (rule.mitigatedBy && rule.mitigatedBy.test(content)) continue;

    // Test/spec files get one severity step down — exploitability is lower.
    const sev: Severity = isTest ? downgrade(rule.severity) : rule.severity;

    findings.push({
      id:       rule.id,
      severity: sev,
      title:    `${rule.title} (${rule.cwe})`,
      detail:   `${rule.detail} Detected in \`${path}\`.`,
      location: path,
      fix:      rule.fix,
    });
  }

  return findings;
}

function downgrade(s: Severity): Severity {
  const order: Severity[] = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const i = order.indexOf(s);
  return order[Math.max(0, i - 1)];
}
