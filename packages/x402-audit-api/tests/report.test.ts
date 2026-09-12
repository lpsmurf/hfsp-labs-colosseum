import { describe, it, expect } from 'vitest';
import { buildReport } from '../src/report.js';
import type { Finding } from '../src/report.js';

function finding(over: Partial<Finding> = {}): Finding {
  return {
    id:         'X-001',
    severity:   'HIGH',
    confidence: 'HIGH',
    title:      't',
    detail:     'd',
    location:   'a.sol',
    fix:        'f',
    ...over,
  };
}

describe('deduplication', () => {
  it('collapses the identical finding reported twice', () => {
    const r = buildReport('repo', 'sha', null, 1, false, [finding(), finding()]);
    expect(r.summary.total).toBe(1);
  });

  // Regression. DEP-001 findings all shared one id AND one location (the
  // manifest path), so a repo with eight vulnerable dependencies reported one
  // advisory. The engine's own tests passed because they never went through
  // buildReport — only the live route did.
  it('keeps distinct findings that share a location', () => {
    const advisories = ['GHSA-a', 'GHSA-b', 'GHSA-c', 'GHSA-d'].map(id =>
      finding({ id: `DEP-001:npm:lodash@4.17.20:${id}`, location: 'package.json' }),
    );
    const r = buildReport('repo', 'sha', null, 1, false, advisories);
    expect(r.summary.total).toBe(4);
  });

  it('shows what the bug looked like, so it is not reintroduced', () => {
    const collapsed = ['GHSA-a', 'GHSA-b', 'GHSA-c', 'GHSA-d'].map(() =>
      finding({ id: 'DEP-001', location: 'package.json' }),
    );
    const r = buildReport('repo', 'sha', null, 1, false, collapsed);
    // Four advisories in, one out. Any engine emitting many findings under one
    // id at one location needs uniqueness in the id or the location.
    expect(r.summary.total).toBe(1);
  });
});

describe('ordering', () => {
  it('sorts by severity, then by confidence within a severity', () => {
    const r = buildReport('repo', 'sha', null, 1, false, [
      finding({ id: 'a', severity: 'HIGH',     confidence: 'LOW' }),
      finding({ id: 'b', severity: 'CRITICAL', confidence: 'LOW' }),
      finding({ id: 'c', severity: 'HIGH',     confidence: 'HIGH' }),
      finding({ id: 'd', severity: 'INFO',     confidence: 'HIGH' }),
    ]);
    expect(r.findings.map(f => f.id)).toEqual(['b', 'c', 'a', 'd']);
  });
});

describe('needsReview', () => {
  it('counts everything below HIGH confidence', () => {
    const r = buildReport('repo', 'sha', null, 1, false, [
      finding({ id: 'a', confidence: 'HIGH' }),
      finding({ id: 'b', confidence: 'MEDIUM' }),
      finding({ id: 'c', confidence: 'LOW' }),
    ]);
    expect(r.summary.needsReview).toBe(2);
  });

  it('treats a missing confidence as HIGH, which is why engines must set it', () => {
    const r = buildReport('repo', 'sha', null, 1, false, [
      finding({ confidence: undefined }),
    ]);
    expect(r.summary.needsReview).toBe(0);
  });
});

describe('verdict', () => {
  it('is CLEAN only with no findings at all', () => {
    expect(buildReport('r', 's', null, 1, false, []).summary.verdict).toBe('CLEAN');
    expect(buildReport('r', 's', null, 1, false, [finding({ severity: 'INFO' })]).summary.verdict)
      .toBe('ISSUES_FOUND');
  });

  it('escalates on any critical', () => {
    expect(
      buildReport('r', 's', null, 1, false, [finding({ severity: 'CRITICAL' })]).summary.verdict,
    ).toBe('CRITICAL_ISSUES');
  });
});

describe('coverage', () => {
  it('is carried into report meta', () => {
    const r = buildReport('r', 's', null, 3, false, [], { solidity: 2, clarity: 1 });
    expect(r.meta.coverage).toEqual({ solidity: 2, clarity: 1 });
  });
});
