import type { RepoFile } from '../github.js';
import type { Finding } from '../report.js';
import { isContractLang } from '../lang.js';

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

// A 32-byte hex literal is far more often a storage slot, typehash or keccak
// constant than a private key. Gating this by language was not enough: aave's
// deployment helper holds `EIP1967_ADMIN_SLOT = '0xb531...'` in TypeScript and
// was reported as a CRITICAL leaked key. Judge by what the value is called.
// No leading \b on purpose. `EIP1967_ADMIN_SLOT` has a word character before
// "SLOT", so \bslot cannot match it — the same mistake \bnonce made against
// `_useNonce`. The trailing group must also allow the opening quote of the
// literal, which sits between the identifier and the match.
const CTX_TAIL = String.raw`\w*\s*[:=]{1,2}\s*['"\`]?\s*$`;

const HASH_CONTEXT = new RegExp(
  `(?:slot|hash|typehash|digest|root|salt|selector|domain|commitment|merkle|leaf|nullifier|topic|sighash|bytes32|keccak|namespace|eip\\d*)${CTX_TAIL}`,
  'i',
);

// Conversely, these names mean the value really is meant to be a credential.
const KEY_CONTEXT = new RegExp(
  `(?:private[_-]?key|secret|mnemonic|seed|passphrase|signer[_-]?key|deployer[_-]?key|wallet[_-]?key|privkey)${CTX_TAIL}`,
  'i',
);

export function checkSecrets(file: RepoFile): Finding[] {
  const findings: Finding[] = [];
  const { path, content } = file;

  if (SAFE_FILES.test(path)) return findings;

  // In contract source a bare 32-byte hex literal is a storage slot, a typehash
  // or a keccak constant — never a private key. Left unfiltered this reported 21
  // CRITICAL "leaked keys" across openzeppelin-contracts, all of them ERC-7201
  // namespaced storage slots.
  const contractSrc = isContractLang(path);

  for (const { id, re, label, severity } of SECRET_PATTERNS) {
    if (contractSrc && id === 'STATIC-SECRET-004') continue;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const matched = m[1] ?? m[0];
      if (PLACEHOLDER.test(matched)) continue;

      // The bare 32-byte-hex pattern needs its surroundings read before it can
      // claim to have found a key.
      let confidence: NonNullable<Finding['confidence']> = 'HIGH';
      let effectiveSeverity: Finding['severity'] = severity;
      if (id === 'STATIC-SECRET-004') {
        const before = content.slice(Math.max(0, m.index - 80), m.index);
        if (HASH_CONTEXT.test(before)) continue;                    // slot/typehash — not a key
        confidence = KEY_CONTEXT.test(before) ? 'HIGH' : 'LOW';     // unnamed 32-byte hex is a guess
        // A hex blob nothing calls a key does not get to headline a report as
        // CRITICAL. Severity should track how sure we are, not just the worst
        // case if we happen to be right.
        if (confidence === 'LOW') effectiveSeverity = 'MEDIUM';
      }

      findings.push({
        id,
        severity: effectiveSeverity,
        confidence,
        title:    `Hardcoded secret detected: ${label}`,
        detail:   `Found a value matching "${label}" pattern hardcoded in \`${path}\`.${confidence === 'LOW' ? ' The surrounding code does not name it as a credential, so this may be a hash, storage slot or other 32-byte constant — verify before treating it as a leak.' : ' If this is a real credential it should be moved to environment variables and the secret rotated immediately.'}`,
        location: path,
        fix:      'Move all secrets to environment variables. Rotate the exposed credential immediately. Add the file to .gitignore if it contains real values.',
      });
      break; // one finding per pattern per file is enough
    }
    re.lastIndex = 0;
  }

  return findings;
}
