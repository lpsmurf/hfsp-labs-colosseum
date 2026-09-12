import { describe, it, expect } from 'vitest';
import { TIERS, T1_ENGINES, parseTier, engineSet, tierCatalog, redactForPreview } from '../src/tiers.js';
import type { TierId } from '../src/tiers.js';

const IDS: TierId[] = ['T0', 'T1', 'T2', 'T3', 'T4'];

describe('tier catalog', () => {
  it('lists every tier', () => {
    expect(tierCatalog().map(t => t.tier)).toEqual(IDS);
  });

  it('never leaks internal engine ids to callers', () => {
    for (const t of tierCatalog()) {
      expect(t).not.toHaveProperty('engines');
    }
  });

  // The invariant that matters commercially: an unavailable tier must not be
  // priced as if it could be bought. Quoting for work we cannot deliver is
  // fraud, not a roadmap.
  it('gives every unavailable tier a blockedOn reason', () => {
    for (const t of tierCatalog()) {
      if (!t.available) {
        expect(t.blockedOn, `${t.tier} is unavailable with no stated blocker`).toBeTruthy();
      }
    }
  });

  it('only marks T0 and T1 available today', () => {
    expect(tierCatalog().filter(t => t.available).map(t => t.tier)).toEqual(['T0', 'T1']);
  });
});

describe('tier depth is monotonic', () => {
  it('each tier runs a superset of the one below', () => {
    for (let i = 1; i < IDS.length - 1; i++) {
      const lower = engineSet(TIERS[IDS[i]]);
      const upper = engineSet(TIERS[IDS[i + 1]]);
      for (const e of lower) {
        expect(upper.has(e), `${IDS[i + 1]} is missing ${e} which ${IDS[i]} runs`).toBe(true);
      }
    }
  });

  it('T0 is a strict subset of T1 — a preview must never analyse more', () => {
    const t0 = engineSet(TIERS.T0);
    const t1 = engineSet(TIERS.T1);
    expect(t0.size).toBeLessThan(t1.size);
    for (const e of t0) expect(t1.has(e)).toBe(true);
  });

  it('T1 declares exactly the engines the static pass defaults to', () => {
    expect([...engineSet(TIERS.T1)].sort()).toEqual([...T1_ENGINES].sort());
  });
});

describe('tier parsing', () => {
  it('accepts known ids case-insensitively', () => {
    expect(parseTier('t1')).toBe('T1');
    expect(parseTier('T2')).toBe('T2');
    expect(parseTier(' t0 ')).toBe('T0');
  });

  // Silently downgrading means a caller pays for depth they do not get.
  it('rejects anything unknown rather than falling back', () => {
    for (const bad of ['T9', 'premium', '', null, undefined, 1, {}]) {
      expect(parseTier(bad as unknown)).toBeNull();
    }
  });
});

describe('preview redaction', () => {
  const report = {
    meta:    { repo: 'r', commitSha: 'abc', coverage: { solidity: 3 } },
    summary: { critical: 1, high: 2, total: 3, needsReview: 1, verdict: 'CRITICAL_ISSUES' },
    findings: [{ id: 'SOL-AUTH-001', location: 'Vault.sol', detail: 'secret sauce' }],
  };

  it('keeps the counts and drops everything actionable', () => {
    const out = redactForPreview(report as never);
    expect(out.summary).toEqual(report.summary);
    expect(out.meta).toEqual(report.meta);
    expect(out.findings).toEqual([]);
    expect(out.preview.redacted).toBe(true);
  });

  it('leaks no finding text anywhere in the payload', () => {
    const serialized = JSON.stringify(redactForPreview(report as never));
    expect(serialized).not.toContain('SOL-AUTH-001');
    expect(serialized).not.toContain('Vault.sol');
    expect(serialized).not.toContain('secret sauce');
  });

  it('names the upgrade and its real price', () => {
    const out = redactForPreview(report as never);
    expect(out.preview.upgrade.tier).toBe('T1');
    expect(out.preview.upgrade.priceUsdc).toBe(TIERS.T1.priceUsdc);
  });
});
