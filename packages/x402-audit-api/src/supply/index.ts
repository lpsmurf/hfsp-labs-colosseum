import type { RepoFile } from '../github.js';
import type { Finding } from '../report.js';
import { ghCommitsForPath } from '../github.js';
import type { EngineId } from '../tiers.js';

// Module 5 — dependency advisory lookup and patch-age scoring.
//
// Two questions, both answered from data we can get for free:
//
//   1. Does this repo depend on a package with a published advisory?
//      → OSV.dev, which aggregates GitHub Security Advisories, RustSec and
//        others. No API key, no rate limit worth worrying about.
//
//   2. When was the security-critical code last touched?
//      → the GitHub commits API, scoped to the files our other engines already
//        flagged. Consensus and verification code that has sat untouched for
//        years is the Liquid contributing factor: a 2019-era cache path that had
//        gone 2+ years without a security re-audit.
//
// Both are advisory-grade signals, not proofs, and the version caveat below is
// important enough that every dependency finding says so in its own text.

const OSV_API = 'https://api.osv.dev/v1';

interface OsvVuln {
  id:        string;
  summary?:  string;
  details?:  string;
  aliases?:  string[];
  severity?: Array<{ type: string; score: string }>;
  database_specific?: { severity?: string };
}

interface OsvBatchResult {
  results?: Array<{ vulns?: Array<{ id: string; modified?: string }> }>;
}

type Ecosystem = 'npm' | 'crates.io';

interface Dep {
  name:      string;
  version:   string;
  ecosystem: Ecosystem;
  source:    string;  // file the dependency was declared in
  exact:     boolean; // did we read a lockfile, or strip a range?
}

// ---------------------------------------------------------------------------
// Manifest parsing
// ---------------------------------------------------------------------------

// "^4.17.1" → "4.17.1". A range is not a version, so anything we derive this
// way is a guess at what would actually be installed.
function stripRange(spec: string): string | null {
  const m = /(\d+\.\d+\.\d+(?:[-+][\w.]+)?)/.exec(spec);
  return m ? m[1] : null;
}

function parsePackageJson(file: RepoFile): Dep[] {
  const out: Dep[] = [];
  let pkg: Record<string, unknown>;
  try { pkg = JSON.parse(file.content) as Record<string, unknown>; } catch { return out; }

  for (const field of ['dependencies', 'devDependencies']) {
    const deps = (pkg[field] ?? {}) as Record<string, string>;
    for (const [name, spec] of Object.entries(deps)) {
      if (typeof spec !== 'string') continue;
      if (spec === '*' || spec.startsWith('workspace:') || spec.startsWith('file:')) continue;
      const version = stripRange(spec);
      if (!version) continue;
      out.push({ name, version, ecosystem: 'npm', source: file.path, exact: false });
    }
  }
  return out;
}

// Minimal Cargo.toml reader: the [dependencies] table, both the `name = "1.2.3"`
// and `name = { version = "1.2.3" }` forms. Deliberately not a TOML parser —
// pulling one in for two shapes is not worth the dependency.
function parseCargoToml(file: RepoFile): Dep[] {
  const out: Dep[] = [];
  let inDeps = false;

  for (const line of file.content.split('\n')) {
    const trimmed = line.trim();

    if (/^\[/.test(trimmed)) {
      inDeps = /^\[(?:dependencies|dev-dependencies|build-dependencies)\]/.test(trimmed);
      continue;
    }
    if (!inDeps || !trimmed || trimmed.startsWith('#')) continue;

    const m = /^([\w-]+)\s*=\s*(.+)$/.exec(trimmed);
    if (!m) continue;
    const [, name, rhs] = m;

    // Path and git dependencies have no registry version to look up.
    if (/\bpath\s*=|\bgit\s*=/.test(rhs)) continue;

    const version = stripRange(rhs);
    if (!version) continue;
    out.push({ name, version, ecosystem: 'crates.io', source: file.path, exact: false });
  }
  return out;
}

export function extractDependencies(files: RepoFile[]): Dep[] {
  const deps: Dep[] = [];
  for (const f of files) {
    if (/(?:^|\/)package\.json$/.test(f.path)) deps.push(...parsePackageJson(f));
    else if (/(?:^|\/)Cargo\.toml$/.test(f.path)) deps.push(...parseCargoToml(f));
  }

  // One entry per name+ecosystem — a monorepo declares the same dep repeatedly.
  const seen = new Set<string>();
  return deps.filter(d => {
    const key = `${d.ecosystem}:${d.name}@${d.version}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// OSV lookup
// ---------------------------------------------------------------------------

// OSV's CVSS vector or its own severity label → our scale. Conservative:
// an advisory with no usable severity lands at MEDIUM rather than being
// dropped or inflated.
function severityOf(vuln: OsvVuln): Finding['severity'] {
  const label = vuln.database_specific?.severity?.toUpperCase();
  if (label === 'CRITICAL') return 'CRITICAL';
  if (label === 'HIGH')     return 'HIGH';
  if (label === 'MODERATE' || label === 'MEDIUM') return 'MEDIUM';
  if (label === 'LOW')      return 'LOW';

  const vector = vuln.severity?.find(s => s.type.startsWith('CVSS'))?.score ?? '';
  const score  = /\/AV:/.test(vector) ? null : Number(vector);
  if (score !== null && Number.isFinite(score)) {
    if (score >= 9) return 'CRITICAL';
    if (score >= 7) return 'HIGH';
    if (score >= 4) return 'MEDIUM';
    return 'LOW';
  }
  return 'MEDIUM';
}

const MAX_DEPS         = 150;  // batch size guard
const MAX_VULN_DETAILS = 12;   // one GET each, so keep the report focused

async function osvBatch(deps: Dep[]): Promise<Map<string, string[]>> {
  const hits = new Map<string, string[]>();
  const slice = deps.slice(0, MAX_DEPS);
  if (slice.length === 0) return hits;

  const res = await fetch(`${OSV_API}/querybatch`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      queries: slice.map(d => ({
        package: { name: d.name, ecosystem: d.ecosystem },
        version: d.version,
      })),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`OSV querybatch ${res.status}`);

  const data = await res.json() as OsvBatchResult;
  (data.results ?? []).forEach((r, i) => {
    const ids = (r.vulns ?? []).map(v => v.id);
    if (ids.length > 0) hits.set(`${slice[i].ecosystem}:${slice[i].name}@${slice[i].version}`, ids);
  });
  return hits;
}

async function osvDetails(id: string): Promise<OsvVuln | null> {
  try {
    const res = await fetch(`${OSV_API}/vulns/${id}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    return await res.json() as OsvVuln;
  } catch {
    return null;
  }
}

async function checkAdvisories(deps: Dep[]): Promise<Finding[]> {
  const findings: Finding[] = [];
  const hits = await osvBatch(deps);
  if (hits.size === 0) return findings;

  // Fetch details for the first N advisory ids so findings carry a real summary
  // and severity rather than just an id.
  const flat: Array<{ dep: Dep; id: string }> = [];
  for (const dep of deps) {
    const ids = hits.get(`${dep.ecosystem}:${dep.name}@${dep.version}`);
    if (ids) for (const id of ids) flat.push({ dep, id });
  }

  const detailed = await Promise.all(
    flat.slice(0, MAX_VULN_DETAILS).map(async e => ({ ...e, vuln: await osvDetails(e.id) })),
  );

  for (const { dep, id, vuln } of detailed) {
    const summary = vuln?.summary ?? vuln?.details?.slice(0, 200) ?? 'No summary published.';
    const cve     = vuln?.aliases?.find(a => a.startsWith('CVE-'));

    findings.push({
      id:         'DEP-001',
      severity:   vuln ? severityOf(vuln) : 'MEDIUM',
      confidence: 'MEDIUM',
      title:      `Known advisory in ${dep.name}@${dep.version}: ${id}`,
      detail:     `${summary}\n\nDeclared in \`${dep.source}\`. Version read as ${dep.version} from a range specifier, not from a lockfile, so the installed version may differ — confirm against the lockfile before acting or dismissing.`,
      location:   dep.source,
      fix:        `Upgrade ${dep.name} past the affected range (see https://osv.dev/vulnerability/${id}), then re-run with the lockfile to confirm.`,
      refs:       [id, ...(cve ? [cve] : []), `https://osv.dev/vulnerability/${id}`],
    });
  }

  const remaining = flat.length - detailed.length;
  if (remaining > 0) {
    findings.push({
      id:         'DEP-002',
      severity:   'INFO',
      confidence: 'HIGH',
      title:      `${remaining} further dependency advisories not expanded`,
      detail:     `OSV matched ${flat.length} advisories across the declared dependencies; the first ${MAX_VULN_DETAILS} are listed individually. Run \`npm audit\` / \`cargo audit\` against the lockfile for the authoritative and complete list.`,
      location:   'dependency manifests',
      fix:        'Run the ecosystem\'s own audit command against the lockfile — it resolves exact installed versions and the transitive tree, neither of which this scan sees.',
      refs:       ['https://osv.dev/'],
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Patch age
// ---------------------------------------------------------------------------

const STALE_MONTHS    = 12;
const VERY_STALE_MONTHS = 24;
const MAX_AGE_CHECKS  = 8;

function monthsSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24 * 30.44);
}

// Scoped to paths another engine already called security-critical. Checking
// every file would cost one API call each and tell us mostly nothing.
async function checkPatchAge(
  owner: string,
  repo: string,
  criticalPaths: string[],
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const paths = [...new Set(criticalPaths)].slice(0, MAX_AGE_CHECKS);

  const results = await Promise.allSettled(
    paths.map(async p => ({ path: p, date: await ghCommitsForPath(owner, repo, p) })),
  );

  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value.date) continue;
    const { path, date } = r.value;
    const age = monthsSince(date);
    if (age < STALE_MONTHS) continue;

    const veryStale = age >= VERY_STALE_MONTHS;
    findings.push({
      id:         'DEP-003',
      severity:   veryStale ? 'MEDIUM' : 'LOW',
      confidence: 'HIGH',
      title:      `Security-critical file untouched for ${Math.floor(age)} months`,
      detail:     `\`${path}\` carries a verification or validation finding and was last modified ${date.slice(0, 10)} (${Math.floor(age)} months ago). Age is not a defect by itself — stable code is often correct code. It matters here because this file is on a path another rule already flagged, and because assumptions around it (dependency behaviour, compiler codegen, consensus parameters, the threat model) drift even when the code does not. The Liquid post-incident reporting put the affected cache path at 2+ years without a security re-audit.`,
      location:   path,
      fix:        'Schedule a focused re-review of this path. Pair it with the differential test described in x402-audit/references/verification-cache.md rather than a re-read alone.',
      refs:       ['x402-audit/references/verification-cache.md'],
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------

export interface SupplyChainResult {
  findings: Finding[];
  checked:  { dependencies: number; pathsAged: number };
}

export async function runSupplyChainAnalysis(
  owner:         string,
  repo:          string,
  files:         RepoFile[],
  criticalPaths: string[],
  engines:       Set<EngineId> = new Set(['advisories', 'patch-age']),
): Promise<SupplyChainResult> {
  const deps = engines.has('advisories') ? extractDependencies(files) : [];

  // Independent: a failure in one should not lose the other.
  const [adv, age] = await Promise.allSettled([
    deps.length > 0 ? checkAdvisories(deps) : Promise.resolve([]),
    engines.has('patch-age') && criticalPaths.length > 0
      ? checkPatchAge(owner, repo, criticalPaths)
      : Promise.resolve([]),
  ]);

  const findings: Finding[] = [];
  if (adv.status === 'fulfilled') findings.push(...adv.value);
  else console.warn('[supply] advisory lookup failed:', adv.reason);
  if (age.status === 'fulfilled') findings.push(...age.value);
  else console.warn('[supply] patch-age lookup failed:', age.reason);

  return {
    findings,
    checked: {
      dependencies: deps.length,
      pathsAged:    Math.min(new Set(criticalPaths).size, MAX_AGE_CHECKS),
    },
  };
}
