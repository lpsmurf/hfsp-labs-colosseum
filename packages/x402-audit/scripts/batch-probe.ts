#!/usr/bin/env npx tsx
/**
 * Batch probe — runs the 402 compliance check against the top N services.
 * No payments are sent — only checks the 402 response structure and replay rejection.
 *
 * Usage:
 *   npx tsx batch-probe.ts [--limit 20] [--tier p1|p2|all]
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const CATALOG = join(__dirname, '..', 'archive', 'services-enriched-2026-06-05.json');
const RAW_CATALOG = join(__dirname, '..', 'archive', 'services-raw-2026-06-05.json');
const REPORTS_DIR = join(__dirname, '..', 'reports');

interface EnrichedService {
  id: string;
  name: string;
  category: string;
  domain: string;
  providerUrl: string;
  networks: string[];
  l30d_calls: number;
  l30d_payers: number;
  min_price_usdc: number | null;
  endpoint_count: number;
  description: string;
}

interface EndpointProbe {
  serviceId: string;
  serviceName: string;
  url: string;
  method: string;
  statusCode: number;
  is402: boolean;
  specIssues: string[];
  replayStatus?: number;
  replayAccepted?: boolean;
  error?: string;
  duration_ms: number;
}

async function probeEndpoint(
  serviceId: string,
  serviceName: string,
  url: string,
  method = 'POST',
): Promise<EndpointProbe> {
  const start = Date.now();
  const result: EndpointProbe = {
    serviceId, serviceName, url, method,
    statusCode: 0, is402: false, specIssues: [],
    duration_ms: 0,
  };

  // Step 1: no payment header
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: method === 'POST' ? '{}' : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    result.statusCode = res.status;
    result.is402 = res.status === 402;

    if (!result.is402) {
      result.specIssues.push(`Expected 402, got ${res.status}`);
    } else {
      const text = await res.text();
      try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        if (!parsed.x402Version) result.specIssues.push('Missing x402Version');
        const accepts = parsed.accepts as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(accepts) || accepts.length === 0) {
          result.specIssues.push('Missing or empty accepts array');
        } else {
          for (const [i, acc] of accepts.entries()) {
            const missing = ['scheme','network','maxAmountRequired','asset','payTo']
              .filter(k => !acc[k]);
            if (missing.length) result.specIssues.push(`accepts[${i}] missing: ${missing.join(',')}`);
            if (!acc.maxTimeoutSeconds) result.specIssues.push(`accepts[${i}] missing maxTimeoutSeconds`);
          }
        }
      } catch {
        result.specIssues.push('402 body is not valid JSON');
      }
    }
  } catch (e) {
    result.error = (e as Error).message;
    result.specIssues.push(`Request failed: ${result.error}`);
    result.duration_ms = Date.now() - start;
    return result;
  }

  // Step 2: replay test
  try {
    const fakePayment = 'a'.repeat(88);
    const replayRes = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-PAYMENT': fakePayment,
      },
      body: method === 'POST' ? '{}' : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    result.replayStatus = replayRes.status;
    result.replayAccepted = replayRes.status === 200;
    if (result.replayAccepted) result.specIssues.push('SECURITY: fake signature accepted!');
  } catch {
    // replay test optional
  }

  result.duration_ms = Date.now() - start;
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : 20;
  const tierIdx = args.indexOf('--tier');
  const tier = tierIdx >= 0 ? args[tierIdx + 1] : 'p1';

  const catalog: EnrichedService[] = JSON.parse(readFileSync(CATALOG, 'utf-8'));
  catalog.sort((a, b) => b.l30d_calls - a.l30d_calls);

  let targets: EnrichedService[];
  if (tier === 'p1') targets = catalog.filter(s => s.l30d_calls >= 1000);
  else if (tier === 'p2') targets = catalog.filter(s => s.l30d_calls >= 100 && s.l30d_calls < 1000);
  else targets = catalog.filter(s => s.l30d_calls > 0);

  targets = targets.slice(0, limit);
  console.log(`Batch probing ${targets.length} services (tier=${tier}, limit=${limit})\n`);

  const results: EndpointProbe[] = [];
  let clean = 0, issues = 0, broken = 0, security = 0;

  // Load raw catalog for actual endpoint URLs
  const rawServices: Array<Record<string, unknown>> = JSON.parse(readFileSync(RAW_CATALOG, 'utf-8'));
  const rawById = new Map<string, Record<string, unknown>>();
  for (const s of rawServices) {
    if (s) rawById.set(s.id as string, s);
  }

  for (const [i, svc] of targets.entries()) {
    // Use the first actual endpoint URL from raw catalog, not just the domain
    const raw = rawById.get(svc.id);
    const endpoints = (raw?.endpoints as Array<Record<string, unknown>> | undefined) ?? [];
    const firstEp = endpoints[0];
    const url = (firstEp?.url as string) || (svc.domain ? `https://${svc.domain}` : svc.providerUrl);
    const method = (firstEp?.method as string) || 'GET';

    if (!url || url === '#') {
      console.log(`[${i+1}/${targets.length}] ${svc.name || svc.id} — no URL, skip`);
      continue;
    }

    process.stdout.write(`[${i+1}/${targets.length}] ${(svc.name || svc.id).padEnd(30)} `);
    const probe = await probeEndpoint(svc.id, svc.name || svc.id, url, method);
    results.push(probe);

    if (probe.specIssues.some(i => i.includes('SECURITY'))) {
      security++;
      console.log(`🚨 SECURITY (${probe.duration_ms}ms)`);
    } else if (probe.specIssues.some(i => i.includes('Request failed') || i.includes('not valid JSON'))) {
      broken++;
      console.log(`❌ BROKEN   (${probe.duration_ms}ms): ${probe.specIssues[0]}`);
    } else if (probe.specIssues.length > 0) {
      issues++;
      console.log(`⚠️  ISSUES  (${probe.duration_ms}ms): ${probe.specIssues.slice(0,2).join(' | ')}`);
    } else {
      clean++;
      console.log(`✅ CLEAN    (${probe.duration_ms}ms)`);
    }

    // Be polite to APIs
    await new Promise(r => setTimeout(r, 200));
  }

  // Save report
  const report = {
    runAt: new Date().toISOString(),
    tier, limit,
    summary: { total: results.length, clean, issues, broken, security },
    results,
  };

  const reportPath = join(REPORTS_DIR, `batch-${tier}-${new Date().toISOString().slice(0,10)}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`\n📊 Batch complete:`);
  console.log(`  ✅ Clean:    ${clean}`);
  console.log(`  ⚠️  Issues:  ${issues}`);
  console.log(`  ❌ Broken:   ${broken}`);
  console.log(`  🚨 Security: ${security}`);
  console.log(`\n💾 Report saved: ${reportPath}`);
}

main();
