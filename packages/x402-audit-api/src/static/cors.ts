import type { RepoFile } from '../github.js';
import type { Finding } from '../report.js';

// Patterns that produce reflected-origin + credentials
const REFLECTED_ORIGIN = [
  { re: /origin\s*:\s*true/gi,     label: '`origin: true` reflects the request Origin header back to the caller' },
  { re: /origin\s*:\s*["']\*["']/gi, label: '`origin: "*"` allows any origin' },
  { re: /allowedOrigins\s*\??\s*[:\|]{1,2}\s*true/gi, label: 'Fallback to `true` reflects any origin when allowlist is empty' },
];

const CREDENTIALS_TRUE = /credentials\s*:\s*true/gi;

// Safe patterns — explicit allowlist with a real value
const SAFE_ORIGIN = /origin\s*:\s*\[/gi;

export function checkCors(file: RepoFile): Finding[] {
  const findings: Finding[] = [];
  const { path, content } = file;

  // Skip test files and lock files
  if (/\.(test|spec)\.|node_modules|\.lock$/.test(path)) return findings;

  const hasCredentials = CREDENTIALS_TRUE.test(content);
  if (!hasCredentials) return findings;

  // Reset regex lastIndex after test()
  CREDENTIALS_TRUE.lastIndex = 0;

  const hasSafeOrigin = SAFE_ORIGIN.test(content);
  SAFE_ORIGIN.lastIndex = 0;
  if (hasSafeOrigin) return findings; // explicit allowlist — safe

  for (const { re, label } of REFLECTED_ORIGIN) {
    if (re.test(content)) {
      re.lastIndex = 0;
      findings.push({
        id:       'STATIC-CORS-001',
        severity: 'HIGH',
        title:    'CORS reflects arbitrary Origin with credentials:true',
        detail:   `${label}. Combined with \`credentials: true\`, any website can make credentialed requests to this API and read the response. x402 auth is the X-PAYMENT header — \`credentials: true\` is not needed.`,
        location: path,
        fix:      'Either remove `credentials: true` (safest for a public x402 API) or replace `origin: true` with an explicit allowlist of trusted origins.',
      });
    }
    re.lastIndex = 0;
  }

  return findings;
}
