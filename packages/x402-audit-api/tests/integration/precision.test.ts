import { describe, it, expect } from 'vitest';
import { fetchRepo } from '../../src/github.js';
import { analyzeStatic } from '../../src/static/index.js';
import { config } from '../../src/config.js';

// Precision gates against real, heavily audited code. These need network and a
// GITHUB_TOKEN (one repo costs well over the 60 requests/hour that
// unauthenticated GitHub allows), so they skip rather than fail without one.
//
//   npm run test:integration
//
// Why these exist: the clean-library baseline below caught three false
// positives, but the four protocols caught four more that a library baseline
// structurally could not — including CRITICAL "unprotected initializer" reports
// against UniswapV2Pair and UniswapV3Pool, which are guarded by a factory check
// and an already-initialized check rather than OpenZeppelin's modifier.
//
// The failure mode this guards against is the one that ends a scanner's
// credibility on first contact: a CRITICAL on famous code that is fine.

const hasToken = Boolean(config.GITHUB_TOKEN);
const suite = hasToken ? describe : describe.skip;

if (!hasToken) {
  console.warn('[integration] GITHUB_TOKEN not set — precision gates skipped');
}

async function auditPublic(repo: string) {
  const meta = await fetchRepo(`https://github.com/${repo}`);
  const { findings, coverage } = await analyzeStatic(meta.files);
  return { findings, coverage, files: meta.files.length };
}

suite('precision gate — real protocol code', () => {
  // Budget: each entry is one full audit, so keep the list short and the
  // timeout generous. aave is the slow one at ~120 files.
  const PROTOCOLS = [
    'Uniswap/v2-core',
    'Uniswap/v3-core',
    'aave/aave-v3-core',
    'transmissions11/solmate',
  ];

  for (const repo of PROTOCOLS) {
    it(`${repo} produces no CRITICAL or HIGH findings`, async () => {
      const { findings, files } = await auditPublic(repo);
      const loud = findings.filter(f => f.severity === 'CRITICAL' || f.severity === 'HIGH');

      const detail = loud
        .map(f => `${f.severity}/${f.confidence} ${f.id} @ ${f.location}`)
        .join('\n  ');

      expect(files, `${repo} fetched no files — check exclusions`).toBeGreaterThan(5);
      expect(
        loud.length,
        `${repo} is heavily audited. Any CRITICAL/HIGH here is a bug in our ` +
        `rules until proven otherwise:\n  ${detail}`,
      ).toBe(0);
    }, 120_000);
  }
});

suite('precision baseline — clean library', () => {
  // OpenZeppelin is as close to bug-free Solidity as exists. Nearly every
  // finding here is a false positive or a benign true positive, so the count is
  // a noise ceiling rather than a correctness check.
  //
  // History: 52 before three false-positive fixes, 22 after. The gate is set
  // above the current number with room for a justified new rule, and below the
  // level where reports stop being readable.
  const CEILING = 30;

  it(`openzeppelin-contracts stays at or under ${CEILING} findings`, async () => {
    const { findings, files } = await auditPublic('OpenZeppelin/openzeppelin-contracts');

    const byId = findings.reduce<Record<string, number>>((acc, f) => {
      const k = `${f.id} [${f.severity}/${f.confidence}]`;
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
    const breakdown = Object.entries(byId)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${String(v).padStart(3)}  ${k}`)
      .join('\n  ');

    expect(files).toBeGreaterThan(50);
    expect(
      findings.length,
      `noise ceiling exceeded — justify the new rule or revert it:\n  ${breakdown}`,
    ).toBeLessThanOrEqual(CEILING);
  }, 120_000);
});

suite('fetcher exclusions', () => {
  it('does not audit vendored dependencies', async () => {
    const { files } = await auditPublic('aave/aave-v3-core');
    expect(files).toBeGreaterThan(0);
  }, 120_000);

  it('skips Foundry submodule contents without needing a lib/ exclusion', async () => {
    // Foundry installs dependencies as git submodules, which GitHub's tree API
    // reports as a single entry of type "commit" rather than as blobs. So their
    // contents are invisible to the blob filter already — which is why `lib` is
    // deliberately NOT in EXCLUDED. See the comment in src/github.ts.
    const meta = await fetchRepo('https://github.com/transmissions11/solmate');
    expect(meta.files.filter(f => /(?:^|\/)lib\//.test(f.path))).toEqual([]);
  }, 120_000);
});
