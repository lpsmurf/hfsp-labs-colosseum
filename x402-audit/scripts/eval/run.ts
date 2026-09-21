#!/usr/bin/env npx tsx
/**
 * Triage eval — current regex scanner vs TypeSafe (Jev) on hand-labeled cases.
 *
 * Live cases are re-probed read-only (no header, one fake X-PAYMENT, or the
 * alternate method — the same requests security-probe.ts sends) and cached in
 * ../eval/evidence/. If a live target no longer reproduces the original
 * condition, the case falls back to its synthetic snapshot, or is skipped.
 *
 * Usage:
 *   npx tsx eval/run.ts               # use cached evidence where present
 *   npx tsx eval/run.ts --capture     # re-probe all live targets
 *   TYPESAFE_API_KEY=... npx tsx eval/run.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { CASES, type Case } from './cases';
import { hasStackTrace, isDiscoveryDoc, scanSecrets } from '../lib/heuristics';
import { decide, triage, triageEnabled, type Evidence, type HttpSample, type TriageResult } from '../lib/typesafe-triage';

const EVAL_DIR = join(__dirname, '..', '..', 'eval');
const EVIDENCE_DIR = join(EVAL_DIR, 'evidence');
const TIMEOUT = 12_000;
const THRESHOLDS = [0.6, 0.7, 0.8, 0.9];

async function fetchSample(url: string, method: string, headers: Record<string, string> = {}): Promise<HttpSample | null> {
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
      body: method === 'POST' ? '{}' : undefined,
      signal: AbortSignal.timeout(TIMEOUT),
    });
    return { status: res.status, contentType: res.headers.get('content-type') ?? '', body: (await res.text()).slice(0, 20_000) };
  } catch {
    return null;
  }
}

interface Captured { evidence: Evidence; reproduces: boolean; capturedAt: string }

async function capture(c: Case): Promise<Captured | null> {
  const { url, method, matchRe } = c.live!;
  const baseline = await fetchSample(url, method);
  if (!baseline) return null;
  let probe: HttpSample | null = baseline;
  let probeLabel: string | undefined;
  let match: string | undefined;
  let reproduces = false;

  if (c.check === 'fake_payment') {
    probe = await fetchSample(url, method, { 'X-PAYMENT': 'a'.repeat(88) });
    probeLabel = 'X-PAYMENT: ' + 'a'.repeat(88);
    reproduces = !!probe && probe.status === 200 && (c.expectedClass === 'free_route' ? baseline.status === 200 : baseline.status === 402);
  } else if (c.check === 'alt_method') {
    const alt = method === 'POST' ? 'GET' : 'POST';
    probe = await fetchSample(url, alt);
    probeLabel = `${alt} instead of ${method}, no payment`;
    reproduces = !!probe && baseline.status === 402 && probe.status === 200 && probe.body.length > 0;
  } else {
    match = matchRe ? baseline.body.match(matchRe)?.[0] : undefined;
    reproduces = !!match;
  }
  if (!probe) return null;
  return { evidence: { url, method, check: c.check, baseline, probe, probeLabel, match }, reproduces, capturedAt: new Date().toISOString() };
}

async function evidenceFor(c: Case, recapture: boolean): Promise<{ ev: Evidence; origin: string } | { skip: string }> {
  if (c.live) {
    const file = join(EVIDENCE_DIR, `${c.id}.json`);
    let cap: Captured | null = null;
    if (!recapture && existsSync(file)) cap = JSON.parse(readFileSync(file, 'utf-8'));
    else {
      cap = await capture(c);
      if (cap) writeFileSync(file, JSON.stringify(cap, null, 2));
    }
    if (cap?.reproduces) return { ev: cap.evidence, origin: `live ${cap.capturedAt.slice(0, 10)}` };
    if (!c.synthetic) return { skip: cap ? 'live target no longer reproduces' : 'live target unreachable' };
  }
  const s = c.synthetic!;
  return {
    ev: { url: s.url, method: s.method, check: c.check, baseline: s.baseline, probe: s.probe, match: s.match },
    origin: c.live ? 'synthetic (live stopped reproducing)' : 'synthetic',
  };
}

/** What the current scanner (security-probe.ts) would report. */
function regexFlags(ev: Evidence): boolean {
  switch (ev.check) {
    case 'fake_payment': return ev.baseline.status === 402 && ev.probe.status === 200;
    case 'alt_method': return ev.baseline.status === 402 && ev.probe.status === 200 && ev.probe.body.length > 0
      && !isDiscoveryDoc(ev.probe.body, ev.probe.contentType);
    case 'secret': return scanSecrets(ev.probe.body).length > 0;
    case 'stack_trace': return hasStackTrace(ev.probe.body);
  }
}

interface Row { c: Case; origin: string; regex: boolean; jev: TriageResult | null; error?: string }

function pct(n: number, d: number) { return d ? `${Math.round((100 * n) / d)}%` : '—'; }

async function main() {
  const recapture = process.argv.includes('--capture');
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const jevOn = triageEnabled();
  if (!jevOn) console.log('TYPESAFE_API_KEY not set — running regex baseline only.\n');

  const rows: Row[] = [];
  for (const c of CASES) {
    const e = await evidenceFor(c, recapture);
    if ('skip' in e) { console.log(`- ${c.id.padEnd(28)} SKIP  ${e.skip}`); continue; }
    const regex = regexFlags(e.ev);
    let jev: TriageResult | null = null;
    let error: string | undefined;
    if (jevOn) {
      try { jev = await triage(e.ev); } catch (err) { error = err instanceof Error ? err.message : String(err); }
    }
    rows.push({ c, origin: e.origin, regex, jev, error });
    const j = jev ? `${jev.decision.padEnd(7)} ${jev.findingClass}@${jev.classConfidence.toFixed(2)} paid=${jev.paidContent.toFixed(2)}`
      + (jev.liveSecret !== undefined ? ` secret=${jev.liveSecret.toFixed(2)}` : '')
      + (jev.stackTrace !== undefined ? ` trace=${jev.stackTrace.toFixed(2)}` : '') : (error ? `ERROR ${error}` : '');
    console.log(`- ${c.id.padEnd(28)} ${c.real ? 'REAL' : 'FP  '}  regex=${regex ? 'flag' : 'pass'}  ${j}  [${e.origin}]`);
  }

  const real = rows.filter(r => r.c.real);
  const fake = rows.filter(r => !r.c.real);
  console.log(`\nCases: ${rows.length} (${real.length} real, ${fake.length} false-positive shapes)\n`);
  console.log('Regex scanner:');
  console.log(`  recall    ${pct(real.filter(r => r.regex).length, real.length)}  (${real.filter(r => !r.regex).map(r => r.c.id).join(', ') || 'no misses'})`);
  console.log(`  FP flags  ${fake.filter(r => r.regex).length}/${fake.length}  (${fake.filter(r => r.regex).map(r => r.c.id).join(', ') || 'none'})`);

  const scored = rows.filter(r => r.jev);
  const summary: Record<string, unknown> = {};
  if (scored.length) {
    console.log('\nJev triage (thresholds applied to one API call per case):');
    console.log('  thresh  missed-real  wrong-confirm  auto-resolved  review-load  regex+jev FP');
    for (const t of THRESHOLDS) {
      const d = (r: Row) => decide(r.c.check, r.jev!, { confirm: t, dismiss: t });
      const missed = scored.filter(r => r.c.real && d(r) === 'dismiss');
      const wrong = scored.filter(r => !r.c.real && d(r) === 'confirm');
      const resolved = scored.filter(r => d(r) !== 'review' && !missed.includes(r) && !wrong.includes(r));
      const review = scored.filter(r => d(r) === 'review');
      const pipelineFp = scored.filter(r => !r.c.real && r.regex && d(r) !== 'dismiss');
      summary[t] = { missed: missed.map(r => r.c.id), wrongConfirm: wrong.map(r => r.c.id), resolved: resolved.length, review: review.length };
      console.log(`  ${t.toFixed(1)}     ${String(missed.length).padEnd(12)} ${String(wrong.length).padEnd(14)} ${pct(resolved.length, scored.length).padEnd(14)} ${pct(review.length, scored.length).padEnd(12)} ${pipelineFp.length}`
        + (missed.length ? `   missed: ${missed.map(r => r.c.id).join(', ')}` : ''));
    }
    const withClass = scored.filter(r => r.c.expectedClass);
    const classHits = withClass.filter(r => r.jev!.findingClass === r.c.expectedClass).length;
    const tokens = scored.reduce((s, r) => s + r.jev!.inputTokens, 0);
    const latency = scored.map(r => r.jev!.latencyMs).sort((a, b) => a - b);
    console.log(`\n  class accuracy ${pct(classHits, withClass.length)} · ${tokens} input tokens total · p50 latency ${latency[Math.floor(latency.length / 2)]}ms · model ${scored[0].jev!.model}`);
  }

  const out = join(EVAL_DIR, `results-${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(out, JSON.stringify({
    runAt: new Date().toISOString(),
    jevEnabled: jevOn,
    thresholds: summary,
    rows: rows.map(r => ({ id: r.c.id, check: r.c.check, real: r.c.real, expectedClass: r.c.expectedClass, origin: r.origin, regexFlag: r.regex, jev: r.jev, error: r.error })),
  }, null, 2));
  console.log(`\n💾 ${out}`);
}

main();
