import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeStatic } from '../src/static/index.js';
import type { Finding } from '../src/report.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

// Fixtures are stored under a name that says what they are, but the engines
// dispatch on the *path* — a manifest has to arrive as `package.json` or the
// package rules never run.
async function scan(fixture: string, asPath?: string): Promise<Finding[]> {
  const content = readFileSync(join(FIXTURES, fixture), 'utf8');
  const { findings } = await analyzeStatic([{ path: asPath ?? fixture, content }]);
  return findings;
}

// Exact counts rather than ">= 1". A rule that stops firing and a rule that
// starts double-firing are both regressions, and only an exact count catches
// the second one.
describe('rule firing — vulnerable fixtures', () => {
  const cases: Array<[string, number, string?]> = [
    ['vuln.sol',          11],
    ['vuln.rs',            8],
    ['vuln.Cargo.toml',    1, 'Cargo.toml'],
    ['cache_vuln.cpp',     3],
    ['cache_vuln.rs',      3],
    ['evil-package.json',  3, 'package.json'],
    ['sink.ts',            3],
    ['app.ts',             2],
  ];

  for (const [fixture, expected, asPath] of cases) {
    it(`${fixture} produces ${expected} findings`, async () => {
      const findings = await scan(fixture, asPath);
      expect(findings.length, findings.map(f => f.id).join(', ')).toBe(expected);
    });
  }
});

// The half that carries the value. Anyone can write a regex that fires; the
// question is whether fixing the code silences it.
describe('corrected fixtures are silent', () => {
  const cases: Array<[string, string?]> = [
    ['clean.sol',           undefined],
    ['cache_fixed.rs',      undefined],
    ['clean-package.json',  'package.json'],
  ];

  for (const [fixture, asPath] of cases) {
    it(`${fixture} produces no findings`, async () => {
      const findings = await scan(fixture, asPath);
      expect(findings.map(f => `${f.id} ${f.location}`)).toEqual([]);
    });
  }
});

describe('every finding is self-describing', () => {
  it('carries confidence, a location and a fix', async () => {
    const all = [
      ...await scan('vuln.sol'),
      ...await scan('vuln.rs'),
      ...await scan('sink.ts'),
      ...await scan('app.ts'),
      ...await scan('evil-package.json', 'package.json'),
    ];
    expect(all.length).toBeGreaterThan(20);

    for (const f of all) {
      // `confidence: undefined` silently counted as HIGH in summary.needsReview,
      // which is how the CORS and payment engines under-reported their own
      // uncertainty for a whole release.
      expect(f.confidence, `${f.id} has no confidence`).toBeDefined();
      expect(['HIGH', 'MEDIUM', 'LOW']).toContain(f.confidence);
      expect(f.location, `${f.id} has no location`).toBeTruthy();
      expect(f.fix.length, `${f.id} has no fix text`).toBeGreaterThan(20);
    }
  });
});

describe('secrets are judged by context, not shape alone', () => {
  it('catches a real private key but not slots or typehashes beside it', async () => {
    const findings = await scan('secret.ts');
    const ids = findings.map(f => f.id).sort();

    // secret.ts holds three 32-byte hex values: a real PRIVATE_KEY, an
    // EIP1967_ADMIN_SLOT and a PERMIT_TYPEHASH. Only the first is a credential.
    expect(ids).toEqual(['STATIC-SECRET-004', 'STATIC-SECRET-005']);
    for (const f of findings) {
      expect(f.confidence).toBe('HIGH');
      expect(f.severity).toBe('CRITICAL');
    }
  });
});

describe('language dispatch', () => {
  it('does not run Solidity rules over TypeScript', async () => {
    const sol = readFileSync(join(FIXTURES, 'vuln.sol'), 'utf8');
    // Same bytes, renamed. Solidity rule ids must not appear.
    const { findings } = await analyzeStatic([{ path: 'notreally.ts', content: sol }]);
    expect(findings.filter(f => f.id.startsWith('SOL-'))).toEqual([]);
  });

  it('counts Clarity files without claiming to analyse them', async () => {
    const { findings, coverage } = await analyzeStatic([
      { path: 'vault.clar', content: '(define-public (withdraw (amount uint)) (ok amount))' },
    ]);
    expect(coverage.clarity).toBe(1);
    // No rules exist yet. The coverage count is what stops a clean report being
    // read as "these contracts were reviewed".
    expect(findings).toEqual([]);
  });
});
