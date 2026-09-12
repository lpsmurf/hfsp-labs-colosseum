// Service tiers.
//
// Tiers differ by the *depth of analysis performed*, never by which findings we
// are willing to show. If a paid-tier engine is not run, its findings do not
// exist — we are not holding them back. The one exception is T0, which returns
// severity counts without locations: a count is a preview, not an actionable
// finding, and nobody can fix what they cannot locate.
//
// Rationale and pricing discussion: x402-audit/references/service-tiers.md

export type TierId = 'T0' | 'T1' | 'T2' | 'T3' | 'T4';

// Every analysis capability the platform can run. Tiers are a selection over
// this set, which keeps "what does tier X actually do" answerable from one
// place instead of scattered through the route handlers.
export type EngineId =
  // T1 — built, in-process, no external binaries
  | 'secrets'
  | 'supply-chain'
  | 'cors'
  | 'payment'
  | 'solidity'
  | 'solana'
  | 'verify-cache'
  | 'dynamic'
  | 'advisories'
  | 'patch-age'
  | 'ai-summary'
  | 'ai-detect'
  // T2 — external binaries, needs a build host
  | 'lockfile'
  | 'aderyn'
  | 'slither'
  | 'semgrep'
  // T3 — needs the target to build and run, plus written invariants
  | 'differential'
  | 'echidna'
  | 'halmos'
  // T4 — a person
  | 'manual-review'
  | 'signed-report';

export const T1_ENGINES: EngineId[] = [
  'secrets', 'supply-chain', 'cors', 'payment',
  'solidity', 'solana', 'verify-cache',
  'dynamic', 'advisories', 'patch-age', 'ai-summary', 'ai-detect',
];

const T2_ENGINES: EngineId[] = [...T1_ENGINES, 'lockfile', 'aderyn', 'slither', 'semgrep'];
const T3_ENGINES: EngineId[] = [...T2_ENGINES, 'differential', 'echidna', 'halmos'];
const T4_ENGINES: EngineId[] = [...T3_ENGINES, 'manual-review', 'signed-report'];

export interface Tier {
  id:          TierId;
  name:        string;
  /** USDC, or null when the tier is not self-serve. */
  priceUsdc:   number | null;
  engines:     EngineId[];
  /** 'counts' redacts titles and locations; 'full' returns complete findings. */
  detail:      'counts' | 'full';
  /** Returns a job id rather than a report — the caller polls. */
  async:       boolean;
  /** A person is involved, so it cannot complete inside a request. */
  human:       boolean;
  /** Can a caller actually buy this today? */
  available:   boolean;
  turnaround:  string;
  /** Present when `available` is false: what has to exist first. */
  blockedOn?:  string;
  summary:     string;
}

export const TIERS: Record<TierId, Tier> = {
  T0: {
    id:         'T0',
    name:       'Preview',
    priceUsdc:  null,               // free
    engines:    T1_ENGINES.filter(e => !['dynamic', 'ai-summary', 'ai-detect'].includes(e)),
    detail:     'counts',
    async:      false,
    human:      false,
    available:  true,
    turnaround: '~15 seconds',
    summary:    'Severity counts, language coverage, and how many findings need manual confirmation. No titles or locations.',
  },
  T1: {
    id:         'T1',
    name:       'Instant scan',
    priceUsdc:  0.99,
    engines:    T1_ENGINES,
    detail:     'full',
    async:      false,
    human:      false,
    available:  true,
    turnaround: '~30 seconds',
    summary:    'All in-process engines: JS/TS, Solidity, Solana/Anchor, verification-cache, supply-chain, live probes, dependency advisories, patch age, plus an AI pass that reads the source and proposes findings of its own.',
  },
  T2: {
    id:         'T2',
    name:       'Deep scan',
    priceUsdc:  49,
    engines:    T2_ENGINES,
    detail:     'full',
    async:      true,
    human:      false,
    available:  false,
    turnaround: '2-10 minutes',
    blockedOn:  'Build host with solc/aderyn/slither/semgrep installed, async job store, and lockfile ingestion. See x402-audit/references/service-tiers.md.',
    summary:    'Adds compiled, cross-file analysis — Aderyn, Slither, Semgrep — plus lockfile-exact transitive advisories. Resolves the inheritance and cross-file questions T1 cannot answer.',
  },
  T3: {
    id:         'T3',
    name:       'Differential & fuzz',
    priceUsdc:  null,               // scoped per engagement
    engines:    T3_ENGINES,
    detail:     'full',
    async:      true,
    human:      true,
    available:  false,
    turnaround: 'hours to days',
    blockedOn:  'Per-project build integration and written invariants. Quote required.',
    summary:    'Cached-vs-uncached differential testing, property fuzzing (Echidna), symbolic execution (Halmos). Proves what T1 can only suspect.',
  },
  T4: {
    id:         'T4',
    name:       'Manual review',
    priceUsdc:  null,
    engines:    T4_ENGINES,
    detail:     'full',
    async:      true,
    human:      true,
    available:  false,
    turnaround: 'days to weeks',
    blockedOn:  'Scoping call, and gated on the AI reasoning layer being proven. T1 pattern recall against 118 real paid findings is ~2-4%; a signed human report backed by that alone is the wrong product. See x402-audit/references/service-tiers.md.',
    summary:    'Everything above plus human review and a signed, publishable report.',
  },
};

export const DEFAULT_TIER: TierId = 'T1';

export function parseTier(raw: unknown): TierId | null {
  if (typeof raw !== 'string') return null;
  const id = raw.trim().toUpperCase();
  return id in TIERS ? id as TierId : null;
}

export function engineSet(tier: Tier): Set<EngineId> {
  return new Set(tier.engines);
}

/** Public tier list for the discovery endpoint — no internal engine ids. */
export function tierCatalog() {
  return Object.values(TIERS).map(t => ({
    tier:       t.id,
    name:       t.name,
    priceUsdc:  t.priceUsdc,
    detail:     t.detail,
    turnaround: t.turnaround,
    available:  t.available,
    summary:    t.summary,
    ...(t.blockedOn ? { blockedOn: t.blockedOn } : {}),
  }));
}

/**
 * Strip everything that makes a finding actionable, keeping the aggregate.
 * T0 only. A count tells you whether to pay; it does not tell you what to fix.
 */
export function redactForPreview(report: {
  meta: Record<string, unknown>;
  summary: Record<string, unknown>;
}) {
  return {
    meta:    report.meta,
    summary: report.summary,
    findings: [],
    preview: {
      redacted: true,
      note: 'Severity counts only. Titles, locations and fixes are returned by T1 and above.',
      upgrade: {
        tier:      'T1',
        priceUsdc: TIERS.T1.priceUsdc,
        gets:      'Full findings with locations, confidence, SWC/CWE references and fixes.',
      },
    },
  };
}
