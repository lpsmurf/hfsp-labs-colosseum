#!/usr/bin/env npx tsx
/**
 * x402 service probe — tests a single endpoint for spec compliance.
 *
 * Usage:
 *   npx tsx probe.ts <url> [--method GET|POST] [--body '{}']
 *
 * What it checks:
 *   1. Without payment: does it return 402 with a valid x402 body?
 *   2. 402 body: x402Version, accepts array, payTo, network, maxAmountRequired
 *   3. With bad/replay signature: does it reject?
 *   4. (Manual) With valid payment: does it return useful data?
 */

import { writeFileSync } from 'fs';
import { join } from 'path';

const FINDINGS_DIR = join(__dirname, '..', 'findings');

interface X402Accept {
  scheme?: string;
  network?: string;
  maxAmountRequired?: string;
  asset?: string;
  payTo?: string;
  maxTimeoutSeconds?: number;
}

interface X402Response {
  x402Version?: number;
  error?: string;
  accepts?: X402Accept[];
}

interface ProbeResult {
  url: string;
  method: string;
  timestamp: string;

  // Step 1: no payment
  statusCode: number;
  is402: boolean;
  responseHeaders: Record<string, string>;
  rawBody: string;

  // Step 2: 402 parse
  parsed402?: X402Response;
  specIssues: string[];

  // Step 3: replay test
  replayStatus?: number;
  replayAccepted?: boolean;
}

async function probe(url: string, method = 'POST', body?: string): Promise<ProbeResult> {
  const result: ProbeResult = {
    url,
    method,
    timestamp: new Date().toISOString(),
    statusCode: 0,
    is402: false,
    responseHeaders: {},
    rawBody: '',
    specIssues: [],
  };

  // Step 1: hit endpoint without payment
  console.log(`\n[1/3] Probing ${method} ${url} (no payment header)`);
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: body ?? (method === 'POST' ? '{}' : undefined),
    });

    result.statusCode = res.status;
    result.is402 = res.status === 402;
    res.headers.forEach((v, k) => { result.responseHeaders[k] = v; });
    result.rawBody = await res.text();

    console.log(`  Status: ${res.status}`);
    if (!result.is402) {
      console.log(`  ⚠️  Expected 402, got ${res.status}`);
      result.specIssues.push(`Expected HTTP 402, got ${res.status}`);
    }
  } catch (e) {
    result.specIssues.push(`Request failed: ${(e as Error).message}`);
    console.log(`  ❌ Request failed: ${(e as Error).message}`);
    return result;
  }

  // Step 2: parse and validate 402 body
  console.log(`\n[2/3] Validating 402 response body`);
  try {
    const parsed = JSON.parse(result.rawBody) as X402Response;
    result.parsed402 = parsed;

    if (parsed.x402Version === undefined) {
      result.specIssues.push('Missing x402Version field');
      console.log('  ⚠️  Missing x402Version');
    } else {
      console.log(`  ✅ x402Version: ${parsed.x402Version}`);
    }

    if (!Array.isArray(parsed.accepts) || parsed.accepts.length === 0) {
      result.specIssues.push('Missing or empty accepts array');
      console.log('  ⚠️  Missing accepts array');
    } else {
      console.log(`  ✅ accepts[]: ${parsed.accepts.length} option(s)`);
      for (const [i, acc] of parsed.accepts.entries()) {
        const missing = (['scheme','network','maxAmountRequired','asset','payTo'] as const)
          .filter(k => !acc[k]);
        if (missing.length) {
          result.specIssues.push(`accepts[${i}] missing fields: ${missing.join(', ')}`);
          console.log(`  ⚠️  accepts[${i}] missing: ${missing.join(', ')}`);
        } else {
          console.log(`  ✅ accepts[${i}]: ${acc.network} · ${acc.maxAmountRequired} ${acc.asset?.slice(0,6)}... → ${acc.payTo?.slice(0,8)}...`);
        }
        if (acc.maxTimeoutSeconds === undefined) {
          result.specIssues.push(`accepts[${i}] missing maxTimeoutSeconds`);
          console.log(`  ⚠️  accepts[${i}] missing maxTimeoutSeconds`);
        }
      }
    }
  } catch {
    result.specIssues.push('402 body is not valid JSON');
    console.log('  ❌ 402 body is not valid JSON');
    console.log(`  Raw: ${result.rawBody.slice(0, 200)}`);
  }

  // Step 3: replay test with a fake/garbage signature
  console.log(`\n[3/3] Testing replay rejection (fake signature)`);
  const fakePayment = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  try {
    const replayRes = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-PAYMENT': fakePayment,
      },
      body: body ?? (method === 'POST' ? '{}' : undefined),
    });
    result.replayStatus = replayRes.status;
    result.replayAccepted = replayRes.status === 200;

    if (replayRes.status === 200) {
      result.specIssues.push('SECURITY: fake/invalid payment signature was accepted (status 200)');
      console.log('  🚨 SECURITY: fake signature ACCEPTED (status 200)!');
    } else if (replayRes.status === 402) {
      console.log('  ✅ Fake signature rejected (still 402)');
    } else {
      console.log(`  ⚠️  Unexpected status for fake payment: ${replayRes.status}`);
    }
  } catch (e) {
    console.log(`  ⚠️  Replay test request failed: ${(e as Error).message}`);
  }

  // Summary
  console.log(`\n📋 Summary for ${url}`);
  if (result.specIssues.length === 0) {
    console.log('  ✅ No spec issues found (manual payment test still needed)');
  } else {
    console.log(`  ⚠️  ${result.specIssues.length} issue(s) found:`);
    result.specIssues.forEach(i => console.log(`    - ${i}`));
  }

  return result;
}

function printFindingStub(result: ProbeResult): string {
  const issues = result.specIssues;
  const sev = issues.some(i => i.includes('SECURITY')) ? 'Critical'
    : issues.some(i => i.includes('Missing')) ? 'High'
    : issues.length > 0 ? 'Medium' : 'None';

  return `# Audit: ${result.url}

**Date:** ${result.timestamp.slice(0, 10)}
**Auditor:** HFSP Labs
**Endpoint:** \`${result.method} ${result.url}\`

## 402 Response Check

\`\`\`
Status: ${result.statusCode}
\`\`\`

\`\`\`json
${result.rawBody.slice(0, 1000)}
\`\`\`

**Spec issues (${issues.length}):**
${issues.length ? issues.map(i => `- ${i}`).join('\n') : '- None found'}

## Replay Test
- Status: ${result.replayStatus ?? 'not tested'}
- Accepted fake signature: ${result.replayAccepted ? '🚨 YES' : '✅ No'}

## Severity: ${sev}
`;
}

// Main
const [,, url, ...flags] = process.argv;
if (!url) {
  console.log('Usage: npx tsx probe.ts <url> [--method GET|POST] [--body "{}"]');
  process.exit(1);
}

const methodIdx = flags.indexOf('--method');
const method = methodIdx >= 0 ? flags[methodIdx + 1] : 'POST';
const bodyIdx = flags.indexOf('--body');
const body = bodyIdx >= 0 ? flags[bodyIdx + 1] : undefined;

probe(url, method, body).then(result => {
  const stub = printFindingStub(result);

  // Save result JSON
  const slug = url.replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 60);
  const jsonPath = join(FINDINGS_DIR, `${slug}-probe.json`);
  writeFileSync(jsonPath, JSON.stringify(result, null, 2));
  console.log(`\n💾 Raw result saved to: ${jsonPath}`);

  // Print finding stub for copy-paste
  console.log('\n--- FINDING STUB ---\n');
  console.log(stub);
});
