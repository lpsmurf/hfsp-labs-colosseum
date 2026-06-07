import type { RepoFile } from '../github.js';
import type { Finding } from '../report.js';

const SECRET_PATTERNS = [
  {
    id:  'STATIC-SECRET-001',
    re:  /\b(sk_live_[a-zA-Z0-9]{20,})/g,
    label: 'Stripe live secret key',
    severity: 'CRITICAL' as const,
  },
  {
    id:  'STATIC-SECRET-002',
    re:  /\b(sk-[a-zA-Z0-9]{40,})\b/g,
    label: 'OpenAI API key',
    severity: 'HIGH' as const,
  },
  {
    id:  'STATIC-SECRET-003',
    // Solana private key: base58 string 87-88 chars long (not in .env.example which shows placeholders)
    re:  /['"` ]([1-9A-HJ-NP-Za-km-z]{87,88})['"` ]/g,
    label: 'Possible Solana private key (base58)',
    severity: 'CRITICAL' as const,
  },
  {
    id:  'STATIC-SECRET-004',
    // EVM private key: 0x + 64 hex chars
    re:  /\b(0x[0-9a-fA-F]{64})\b/g,
    label: 'Possible EVM private key (hex)',
    severity: 'CRITICAL' as const,
  },
  {
    id:  'STATIC-SECRET-005',
    re:  /PRIVATE_KEY\s*=\s*["']?[^\s"'${}#]{30,}/g,
    label: 'PRIVATE_KEY variable assigned a real value (not a placeholder)',
    severity: 'CRITICAL' as const,
  },
];

// Files where real secrets are expected / acceptable
const SAFE_FILES = /\.env\.example$|\.env\.sample$|README|\.md$|\.test\.|\.spec\.|node_modules/i;

// Placeholder patterns — skip these
const PLACEHOLDER = /your[_-]?key|your[_-]?secret|<[^>]+>|\$\{|xxx|redact|placeholder|changeme|todo/i;

export function checkSecrets(file: RepoFile): Finding[] {
  const findings: Finding[] = [];
  const { path, content } = file;

  if (SAFE_FILES.test(path)) return findings;

  for (const { id, re, label, severity } of SECRET_PATTERNS) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const matched = m[1] ?? m[0];
      if (PLACEHOLDER.test(matched)) continue;

      findings.push({
        id,
        severity,
        title:    `Hardcoded secret detected: ${label}`,
        detail:   `Found a value matching "${label}" pattern hardcoded in \`${path}\`. If this is a real credential it should be moved to environment variables and the secret rotated immediately.`,
        location: path,
        fix:      'Move all secrets to environment variables. Rotate the exposed credential immediately. Add the file to .gitignore if it contains real values.',
      });
      break; // one finding per pattern per file is enough
    }
    re.lastIndex = 0;
  }

  return findings;
}
