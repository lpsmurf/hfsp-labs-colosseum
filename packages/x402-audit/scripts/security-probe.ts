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
 *   npx tsx security-probe.ts [--tier p1|p2|all] [--limit 30]
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const RAW_CATALOG = join(__dirname, '..', 'archive', 'services-raw-2026-06-05.json');
const ENRICHED = join(__dirname, '..', 'archive', 'services-enriched-2026-06-05.json');
const REPORTS_DIR = join(__dirname, '..', 'reports');

const TIMEOUT = 12_000;

// Secrets / sensitive markers that should NEVER appear in a 402 or error body.
const SECRET_PATTERNS: Array<[string, RegExp]> = [
  // NOTE: a bare 64-hex heuristic was removed — it false-positives on tx
  // hashes, signatures, and 32-byte content hashes that legitimately appear
  // in 402 bodies. Only match high-confidence secret formats below.
  ['solana_secret_arr', /\[\s*\d{1,3}\s*(,\s*\d{1,3}\s*){31,}\]/], // [12,34,...] keypair array
  ['aws_key',           /AKIA[0-9A-Z]{16}/],
  ['openai_key',        /sk-[A-Za-z0-9]{20,}/],
  ['jwt',               /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['stripe_secret',     /sk_live_[A-Za-z0-9]{16,}/], // pk_live_ is a PUBLISHABLE key (public by design) — not a leak
  ['internal_ip',       /\b(10\.\d{1,3}|192\.168|172\.(1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/],
];

// NOTE: bare filesystem paths ('/home/', '/usr/src/app') were REMOVED — they
// false-positive on ordinary content/URLs (e.g. a "HomePulse" service whose
// resource URL contains '/home/'). Keep only high-confidence trace signatures.
const STACKTRACE_MARKERS = [
  'at Object.', 'at Module.', 'Traceback (most recent call last)',
  'java.lang.', 'System.Exception', 'goroutine ', 'panic:',
  'webpack-internal', '\n    at ', // V8 stack frame: newline + indent + "at "
];

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

function scanSecrets(text: string): string[] {
  const hits: string[] = [];
  for (const [name, re] of SECRET_PATTERNS) {
    if (re.test(text)) hits.push(name);
  }
  return hits;
}

function hasStackTrace(text: string): boolean {
  return STACKTRACE_MARKERS.some(m => text.includes(m));
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

  const baseSecrets = scanSecrets(base.body);
  if (baseSecrets.length) f.secretsLeaked.push(...baseSecrets);
  if (hasStackTrace(base.body)) { f.stackTraceLeak = true; f.notes.push('stack trace in baseline body'); }

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
    } else if (r.status === 200 && !baselineGated) {
      f.notes.push(`'${label}' payment → 200 but baseline is ${base.status} (route not gated — not a bypass)`);
    }
    if (r.status >= 500) {
      f.crashOnMalformed = true;
      f.notes.push(`5xx on '${label}' payment (${r.status})`);
    }
    if (hasStackTrace(r.body)) { f.stackTraceLeak = true; f.notes.push(`stack trace on '${label}' payment`); }
    const s = scanSecrets(r.body);
    if (s.length) f.secretsLeaked.push(...s);
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
    const b = alt.body.slice(0, 600);
    const altCT = alt.headers.get('content-type') ?? '';
    // A GET that returns a MANIFEST / landing page / docs / agent card is
    // expected, NOT a bypass. Across 744 services this heuristic produced ONLY
    // false positives: GET universally serves discovery content (JSON manifest,
    // HTML landing page, markdown docs, agent card, or "POST here" help text)
    // while the paid route is POST-gated. We treat all of those as discovery.
    const isHtmlOrMarkdown = /^\s*<!doctype|^\s*<html|text\/html|text\/markdown/i.test(altCT + '\n' + b);
    const isHelpText = /send\s+a?\s*POST|this\s+is\s+a\s+POST\s+endpoint|"name"\s*:|"description"\s*:|POST\s+\/?\s*[—-]\s*\$/i.test(b);
    const isManifest = /"\$schema"|agent\s*card|"protocol"\s*:\s*"(A2A|mcp)"|openapi|"x402Version"|"accepts"\s*:|"price"\s*:|"price_per_call"\s*:|"method"\s*:\s*"POST"|"pay_to"\s*:|"atomic_amount"\s*:|"network_caip"\s*:/i.test(b);
    const isDiscoveryDoc = isManifest || isHtmlOrMarkdown || isHelpText;
    if (!isDiscoveryDoc) {
      f.methodConfusion = true;
      f.notes.push(`${altMethod} returns 200 (non-discovery) while ${method} is 402-gated`);
    } else {
      f.notes.push(`${altMethod} serves public discovery doc (expected, not a bypass)`);
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

  // Severity
  if (f.authBypass || f.secretsLeaked.length) f.severity = 'critical';
  else if (f.methodConfusion || f.corsWildcardWithCreds || f.stackTraceLeak) f.severity = 'high';
  else if (f.crashOnMalformed) f.severity = 'medium';
  else f.severity = 'info';

  return f;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  const args = process.argv.slice(2);
  const tier = args.includes('--tier') ? args[args.indexOf('--tier') + 1] : 'p1';
  const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : 30;

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

  const report = {
    runAt: new Date().toISOString(),
    tier, probed: findings.length,
    summary: counts,
    payToCollisions: collisions.map(([payTo, names]) => ({ payTo, services: [...new Set(names)] })),
    findings,
  };
  const out = join(REPORTS_DIR, `security-${tier}-${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(out, JSON.stringify(report, null, 2));

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
}

main();
