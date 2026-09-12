import { describe, it, expect } from 'vitest';
import { extractJson, groundFindings } from '../src/ai/detect.js';
import type { RawFinding } from '../src/ai/detect.js';
import type { RepoFile } from '../src/github.js';

// The AI pass proposes findings from reasoning rather than pattern matching,
// which is the only route to the 81% of real audit findings that are logic bugs.
// The price is that a model can invent a file, or cite a line past the end of a
// real one. Grounding is what stops a hallucination reaching a customer, so it
// is the part that has to be tested.

const SENT: RepoFile[] = [
  { path: 'src/Vault.sol',      content: Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join('\n') },
  { path: 'src/lib/Math.sol',   content: Array.from({ length: 10 }, (_, i) => `m ${i + 1}`).join('\n') },
];

const ok = (over: Partial<RawFinding> = {}): RawFinding => ({
  file: 'src/Vault.sol', line_start: 10, line_end: 20,
  severity: 'high', title: 'Shares are credited before assets arrive',
  exploit: 'call deposit with 0', impact: 'drain', fix: 'reorder',
  ...over,
});

describe('response parsing', () => {
  it('parses clean JSON', () => {
    expect(extractJson('{"findings":[{"title":"a"}]}')).toHaveLength(1);
  });

  it('parses through markdown fences and preamble', () => {
    const raw = 'Here is my analysis:\n```json\n{"findings":[{"title":"a"},{"title":"b"}]}\n```\nDone.';
    expect(extractJson(raw)).toHaveLength(2);
  });

  it('returns nothing for malformed output rather than throwing', () => {
    expect(extractJson('not json at all')).toEqual([]);
    expect(extractJson('{"findings": [oops')).toEqual([]);
    expect(extractJson('')).toEqual([]);
  });

  it('treats a missing findings array as no findings', () => {
    expect(extractJson('{"result":"all clear"}')).toEqual([]);
  });
});

describe('grounding — hallucinations must not reach a report', () => {
  it('drops a finding citing a file we never sent', () => {
    const { findings, rejected } = groundFindings([ok({ file: 'src/Imaginary.sol' })], SENT);
    expect(findings).toEqual([]);
    expect(rejected).toBe(1);
  });

  it('drops a finding with no title', () => {
    const { findings, rejected } = groundFindings([ok({ title: undefined })], SENT);
    expect(findings).toEqual([]);
    expect(rejected).toBe(1);
  });

  it('keeps a valid finding and cites the line range', () => {
    const { findings, rejected } = groundFindings([ok()], SENT);
    expect(rejected).toBe(0);
    expect(findings).toHaveLength(1);
    expect(findings[0].location).toBe('src/Vault.sol:10-20');
  });

  it('resolves a bare filename to the path we sent', () => {
    const { findings } = groundFindings([ok({ file: 'Vault.sol' })], SENT);
    expect(findings[0].location).toBe('src/Vault.sol:10-20');
  });
});

describe('confidence is never HIGH — nothing here is verified', () => {
  it('gives MEDIUM when the cited lines exist', () => {
    const { findings } = groundFindings([ok()], SENT);
    expect(findings[0].confidence).toBe('MEDIUM');
  });

  it('degrades to LOW and drops the range when the line is past EOF', () => {
    const { findings } = groundFindings([ok({ line_start: 9999 })], SENT);
    expect(findings).toHaveLength(1);
    expect(findings[0].confidence).toBe('LOW');
    expect(findings[0].location).toBe('src/Vault.sol');
    expect(findings[0].detail).toContain('did not cite a line range that exists');
  });

  it('never emits HIGH confidence for any input', () => {
    const wild: RawFinding[] = [
      ok(), ok({ line_start: 1, line_end: 1 }), ok({ severity: 'critical' }),
      ok({ file: 'Math.sol', line_start: 3 }), ok({ line_start: 0 }),
    ];
    const { findings } = groundFindings(wild, SENT);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) expect(f.confidence).not.toBe('HIGH');
  });
});

describe('report integration', () => {
  it('labels every finding as unverified', () => {
    const { findings } = groundFindings([ok()], SENT);
    expect(findings[0].detail).toContain('Unverified AI finding');
    expect(findings[0].refs).toContain('AI-generated — unverified');
  });

  it('normalises severity to CRITICAL or HIGH only', () => {
    const sevs = ['critical', 'high', 'medium', 'low', 'info', 'nonsense', undefined]
      .map(s => groundFindings([ok({ severity: s })], SENT).findings[0].severity);
    expect(new Set(sevs)).toEqual(new Set(['CRITICAL', 'HIGH']));
  });

  // buildReport dedupes on id + location. All AI findings share one id, so
  // uniqueness has to live in the location or several findings in one file
  // collapse into one — the DEP-001 bug, avoided deliberately this time.
  it('keeps one id but distinct locations, so findings survive dedupe', () => {
    const { findings } = groundFindings(
      [ok({ line_start: 10 }), ok({ line_start: 30 }), ok({ file: 'src/lib/Math.sol', line_start: 2 })],
      SENT,
    );
    expect(new Set(findings.map(f => f.id))).toEqual(new Set(['AI-DETECT']));
    expect(new Set(findings.map(f => f.location)).size).toBe(3);
  });

  it('supplies fix text even when the model omitted it', () => {
    const { findings } = groundFindings([ok({ fix: undefined })], SENT);
    expect(findings[0].fix.length).toBeGreaterThan(20);
  });
});
