#!/usr/bin/env npx tsx
/**
 * x402 SECURITY probe — goes beyond spec compliance to test for real
 * vulnerabilities. No valid payments are ever sent; every test is read-only
 * or uses deliberately invalid payloads.
 *
 * Tests per endpoint:
 *   A. Auth bypass     — do empty / garbage / structured-fake X-PAYMENT headers
 *                        get a 200 (paid content for free)?
 *   B. Method confusion — does swapping the HTTP method skip the 402 gate?
 *   C. Crash on input  — does a malformed X-PAYMENT trigger a 500 + stack trace
 *                        (info disclosure + DoS surface)?
 *   D. CORS            — wildcard ACAO combined with credentials = creds leak.
 *   E. Info disclosure — server/internal headers, stack traces, secrets in body.
 *   F. payTo capture   — record the payTo per service for cross-service collision
 *                        analysis (a shared payTo across unrelated vendors is a
 *                        facilitator-hijack / mis-registration signal).
 *
 * Usage:
 *   npx tsx security-probe.ts [--tier p1|p2|all] [--limit 30] [--shadow]
 *
 *   --shadow  ALSO ask TypeSafe (Jev) about each hit and each regex near-miss
 *             (needs TYPESAFE_API_KEY). Shadow only: findings and severity are
 *             never changed. Verdicts are appended to ../eval/shadow-log.jsonl
 *             for comparison against manual verification (eval/shadow.ts).
 */

import { appendFileSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { scanSecrets, hasStackTrace, isDiscoveryDoc, firstSecretMatch } from './lib/heuristics';
import { triage, triageEnabled, type Check, type Evidence, type HttpSample, type TriageResult } from './lib/typesafe-triage';
import { disagrees, shadowRow, SHADOW_LOG } from './eval/shadow-log';

const RAW_CATALOG = join(__dirname, '..', 'archive', 'services-raw-2026-06-05.json');
const ENRICHED = join(__dirname, '..', 'archive', 'services-enriched-2026-06-05.json');
const REPORTS_DIR = join(__dirname, '..', 'reports');

const TIMEOUT = 12_000;
let SHADOW = false;

interface SecFinding {
  serviceId: string;
  serviceName: string;
  url: string;
  method: string;
  payTo?: string;
  network?: string;
  authBypass: boolean;           // any fake payment got 200
  authBypassDetail?: string;
  methodConfusion: boolean;      // alternate method skipped the gate
  crashOnMalformed: boolean;     // 5xx on garbage payment
  stackTraceLeak: boolean;
  corsWildcardWithCreds: boolean;
  corsAcao?: string;
  secretsLeaked: string[];       // pattern names found in any body
  serverHeader?: string;
  notes: string[];
  shadow?: Array<{ check: Check; regexFlag: boolean } & TriageResult>;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
}

async function safeFetch(url: string, opts: RequestInit): Promise<{ status: number; body: string; headers: Headers } | null> {
  try {
    const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(TIMEOUT) });
    const body = await res.text();
    return { status: res.status, body, headers: res.headers };
  } catch {
    return null;
  }
}

async function probeSecurity(
  serviceId: string, serviceName: string, url: string, method: string,
): Promise<SecFinding> {
  const f: SecFinding = {
    serviceId, serviceName, url, method,
    authBypass: false, methodConfusion: false, crashOnMalformed: false,
    stackTraceLeak: false, corsWildcardWithCreds: false,
    secretsLeaked: [], notes: [], severity: 'info',
  };
  const jsonHeaders = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
  const reqBody = method === 'POST' ? '{}' : undefined;

  // Baseline (no payment) — capture payTo, headers, scan body
  const base = await safeFetch(url, { method, headers: jsonHeaders, body: reqBody });
  if (!base) { f.notes.push('baseline request failed (timeout/network)'); return f; }
  f.serverHeader = base.headers.get('server') ?? undefined;

  // Parse payTo / network from a well-formed 402
  try {
    const j = JSON.parse(base.body) as { accepts?: Array<{ payTo?: string; network?: string }> };
    const a = j.accepts?.[0];
    if (a) { f.payTo = a.payTo; f.network = a.network; }
  } catch { /* non-JSON 402 handled elsewhere */ }

  const baseSample = toSample(base);
  // Per check: the first regex hit, else the first near-miss the regex passed
  const evidence = new Map<Check, { ev: Evidence; regexFlag: boolean }>();
  const addEvidence = (check: Check, probe: HttpSample, probeLabel: string, match?: string, regexFlag = true) => {
    const prev = evidence.get(check);
    if (!prev || (!prev.regexFlag && regexFlag)) {
      evidence.set(check, { ev: { url, method, check, baseline: baseSample, probe, probeLabel, match }, regexFlag });
    }
  };

  const baseSecrets = scanSecrets(base.body);
  if (baseSecrets.length) addEvidence('secret', baseSample, 'no payment', firstSecretMatch(base.body));
  if (baseSecrets.length) f.secretsLeaked.push(...baseSecrets);
  if (hasStackTrace(base.body)) { f.stackTraceLeak = true; f.notes.push('stack trace in baseline body'); addEvidence('stack_trace', baseSample, 'no payment'); }

  // A. Auth bypass — three flavors of bogus payment headers
  const fakePayments: Array<[string, string]> = [
    ['empty', ''],
    ['garbage88', 'a'.repeat(88)],
    // structured-but-fake base64 of a plausible-looking payment object
    ['structured', Buffer.from(JSON.stringify({
      x402Version: 1, scheme: 'exact', network: f.network ?? 'base-mainnet',
      payload: { signature: '0x' + 'de'.repeat(32), authorization: {} },
    })).toString('base64')],
  ];
  // Only a genuine bypass if the gate was actually closed to begin with:
  // baseline (no X-PAYMENT) MUST be 402. If baseline is already 200, the route
  // is free/echo/manifest (not gated) and a 200 on junk proves nothing — this
  // was the source of every P4 critical false-positive (fiasignals, wisely, fpds).
  const baselineGated = base.status === 402;
  for (const [label, val] of fakePayments) {
    const r = await safeFetch(url, { method, headers: { ...jsonHeaders, 'X-PAYMENT': val }, body: reqBody });
    if (!r) continue;
    if (r.status === 200 && baselineGated) {
      f.authBypass = true;
      f.authBypassDetail = `fake '${label}' payment accepted (200) while baseline is 402`;
      f.notes.push(f.authBypassDetail);
      addEvidence('fake_payment', toSample(r), `X-PAYMENT: ${label}`);
    } else if (r.status === 200 && !baselineGated) {
      f.notes.push(`'${label}' payment → 200 but baseline is ${base.status} (route not gated — not a bypass)`);
      addEvidence('fake_payment', toSample(r), `X-PAYMENT: ${label}`, undefined, false);
    }
    if (r.status >= 500) {
      f.crashOnMalformed = true;
      f.notes.push(`5xx on '${label}' payment (${r.status})`);
    }
    if (hasStackTrace(r.body)) {
      f.stackTraceLeak = true; f.notes.push(`stack trace on '${label}' payment`);
      addEvidence('stack_trace', toSample(r), `X-PAYMENT: ${label}`);
    }
    const s = scanSecrets(r.body);
    if (s.length) { f.secretsLeaked.push(...s); addEvidence('secret', toSample(r), `X-PAYMENT: ${label}`, firstSecretMatch(r.body)); }
    await sleep(120);
  }

  // B. Method confusion — try the opposite method without payment
  const altMethod = method === 'POST' ? 'GET' : 'POST';
  const alt = await safeFetch(url, {
    method: altMethod, headers: jsonHeaders,
    body: altMethod === 'POST' ? '{}' : undefined,
  });
  if (alt && alt.status === 200 && alt.body.length > 0 && base.status === 402) {
    // 200 on the alternate method MIGHT be paid content served for free.
    // BUT many x402 agents serve a public discovery doc (A2A agent card,
    // OpenAPI, x402 manifest) on GET by design — that is NOT a bypass.
    const altCT = alt.headers.get('content-type') ?? '';
    const discovery = isDiscoveryDoc(alt.body, altCT);
    if (!discovery) {
      f.methodConfusion = true;
      f.notes.push(`${altMethod} returns 200 (non-discovery) while ${method} is 402-gated`);
      addEvidence('alt_method', toSample(alt), `${altMethod} instead of ${method}, no payment`);
    } else {
      f.notes.push(`${altMethod} serves public discovery doc (expected, not a bypass)`);
      addEvidence('alt_method', toSample(alt), `${altMethod} instead of ${method}, no payment`, undefined, false);
    }
  }

  // D. CORS — preflight-style check
  const cors = await safeFetch(url, {
    method, headers: { ...jsonHeaders, 'Origin': 'https://evil.example' }, body: reqBody,
  });
  if (cors) {
    const acao = cors.headers.get('access-control-allow-origin') ?? undefined;
    const acac = cors.headers.get('access-control-allow-credentials');
    f.corsAcao = acao;
    if ((acao === '*' || acao === 'https://evil.example') && acac === 'true') {
      f.corsWildcardWithCreds = true;
      f.notes.push(`CORS reflects origin (${acao}) WITH credentials=true`);
    }
  }

  // Dedup secrets
  f.secretsLeaked = [...new Set(f.secretsLeaked)];

  // Shadow — record Jev's verdict next to the regex result; never changes the finding
  if (SHADOW && evidence.size) {
    f.shadow = [];
    for (const [check, { ev, regexFlag }] of evidence) {
      try {
        const t = await triage(ev);
        if (t) f.shadow.push({ check, regexFlag, ...t });
      } catch (err) {
        f.notes.push(`shadow triage failed for ${check}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  // Severity
  if (f.authBypass || f.secretsLeaked.length) f.severity = 'critical';
  else if (f.methodConfusion || f.corsWildcardWithCreds || f.stackTraceLeak) f.severity = 'high';
  else if (f.crashOnMalformed) f.severity = 'medium';
  else f.severity = 'info';

  return f;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function toSample(r: { status: number; body: string; headers: Headers }): HttpSample {
  return { status: r.status, contentType: r.headers.get('content-type') ?? '', body: r.body };
}

async function main() {
  const args = process.argv.slice(2);
  const tier = args.includes('--tier') ? args[args.indexOf('--tier') + 1] : 'p1';
  const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : 30;
  SHADOW = args.includes('--shadow');
  if (SHADOW && !triageEnabled()) { console.error('--shadow needs TYPESAFE_API_KEY'); process.exit(1); }

  const enriched: Array<{ id: string; name: string; l30d_calls: number }> =
    JSON.parse(readFileSync(ENRICHED, 'utf-8'));
  enriched.sort((a, b) => b.l30d_calls - a.l30d_calls);

  let pool = enriched;
  if (tier === 'p1') pool = enriched.filter(s => s.l30d_calls >= 1000);
  else if (tier === 'p2') pool = enriched.filter(s => s.l30d_calls >= 100 && s.l30d_calls < 1000);
  else if (tier === 'p3') pool = enriched.filter(s => s.l30d_calls >= 10 && s.l30d_calls < 100);
  else if (tier === 'p4') pool = enriched.filter(s => s.l30d_calls >= 1 && s.l30d_calls < 10);
  pool = pool.slice(0, limit);

  const raw: Array<Record<string, unknown>> = JSON.parse(readFileSync(RAW_CATALOG, 'utf-8'));
  const rawById = new Map<string, Record<string, unknown>>();
  for (const s of raw) if (s) rawById.set(s.id as string, s);

  console.log(`🔐 Security-probing ${pool.length} services (tier=${tier})\n`);

  const findings: SecFinding[] = [];
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };

  for (const [i, svc] of pool.entries()) {
    const r = rawById.get(svc.id);
    const eps = (r?.endpoints as Array<Record<string, unknown>> | undefined) ?? [];
    const ep = eps[0];
    const url = (ep?.url as string) || `https://${(r?.domain as string) ?? ''}`;
    const method = (ep?.method as string) || 'GET';
    if (!url || url === 'https://') { console.log(`[${i + 1}] ${svc.name} — no URL, skip`); continue; }

    process.stdout.write(`[${i + 1}/${pool.length}] ${(svc.name || svc.id).slice(0, 30).padEnd(30)} `);
    const f = await probeSecurity(svc.id, svc.name || svc.id, url, method);
    findings.push(f);
    counts[f.severity]++;

    const icon = { critical: '🚨', high: '⚠️ ', medium: '🔶', low: '·', info: '✅' }[f.severity];
    console.log(`${icon} ${f.severity.toUpperCase().padEnd(8)} ${f.notes.slice(0, 2).join(' | ') || 'no issues'}`);
    await sleep(150);
  }

  // Cross-service payTo collision analysis (pure data, all probed services)
  const byPayTo = new Map<string, string[]>();
  for (const f of findings) {
    if (!f.payTo) continue;
    const list = byPayTo.get(f.payTo) ?? [];
    list.push(f.serviceName);
    byPayTo.set(f.payTo, list);
  }
  const collisions = [...byPayTo.entries()].filter(([, names]) => new Set(names).size > 1);

  const shadowed = findings.flatMap(f => (f.shadow ?? []).map(t => ({ f, t })));
  const report = {
    runAt: new Date().toISOString(),
    tier, probed: findings.length,
    ...(SHADOW ? { shadow: {
      calls: shadowed.length,
      inputTokens: shadowed.reduce((s, x) => s + x.t.inputTokens, 0),
      totalLatencyMs: shadowed.reduce((s, x) => s + x.t.latencyMs, 0),
      disagreements: shadowed.filter(x => disagrees(x.t.regexFlag, x.t.decision)).length,
    } } : {}),
    summary: counts,
    payToCollisions: collisions.map(([payTo, names]) => ({ payTo, services: [...new Set(names)] })),
    findings,
  };
  const out = join(REPORTS_DIR, `security-${tier}-${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(out, JSON.stringify(report, null, 2));
  if (shadowed.length) {
    appendFileSync(SHADOW_LOG, shadowed.map(({ f, t }) => JSON.stringify(shadowRow(report.runAt, f.serviceId, f.url, t))).join('\n') + '\n');
  }

  console.log(`\n📊 Security scan complete:`);
  console.log(`  🚨 Critical: ${counts.critical}`);
  console.log(`  ⚠️  High:     ${counts.high}`);
  console.log(`  🔶 Medium:   ${counts.medium}`);
  console.log(`  ✅ Info:     ${counts.info}`);
  if (collisions.length) {
    console.log(`\n  🔗 payTo collisions (same address, multiple services):`);
    for (const [payTo, names] of collisions) {
      console.log(`     ${payTo} → ${[...new Set(names)].join(', ')}`);
    }
  }
  console.log(`\n💾 ${out}`);
  if (shadowed.length) console.log(`👥 ${shadowed.length} shadow verdicts → ${SHADOW_LOG} (npx tsx eval/shadow.ts report)`);
}

main();
