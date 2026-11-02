// T1 — $0.99 USDC. Full findings.
//
// Payment: the GET returns a 402 carrying a V2 challenge. Any x402 V2 client
// can settle it; this script prints the challenge and, when PAID_TX_HASH is
// set, uses the legacy header path so the kit is runnable without a signer.
import { API, honestyChecks } from './types.js';
import type { AuditReport, TierId } from './types.js';

const SEV_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

async function main() {
  const repo = process.argv[2];
  const tier = (process.argv[3] ?? 'T1') as TierId;
  if (!repo) {
    console.error('usage: tsx scripts/audit-scan.ts <github-repo-url> [tier]');
    process.exit(1);
  }

  // 1. Quote.
  const quote = await fetch(`${API}/audit?repo=${encodeURIComponent(repo)}&tier=${tier}`);

  if (quote.status === 501) {
    const b = await quote.json() as { error: string; blockedOn?: string; contact?: string };
    console.error(`${b.error}\nblocked on: ${b.blockedOn}\ncontact: ${b.contact}`);
    process.exit(3);
  }
  if (quote.status !== 402) {
    const b = await quote.json().catch(() => ({})) as { error?: string };
    console.error(`expected a 402 challenge, got ${quote.status}: ${b.error ?? ''}`);
    process.exit(1);
  }

  const challenge = await quote.json() as {
    accepts: Array<{ network: string; amount: string; payTo: string }>;
    costBreakdown: { priceUsdc: number };
  };
  console.log(`quote: $${challenge.costBreakdown.priceUsdc} USDC`);
  for (const a of challenge.accepts) console.log(`  ${a.network}  ${a.amount}  → ${a.payTo}`);

  const txHash = process.env.PAID_TX_HASH;
  if (!txHash) {
    console.log('\nSet PAID_TX_HASH to an already-settled USDC transfer, or POST with a');
    console.log('PAYMENT-SIGNATURE header using any x402 V2 client (e.g. @x402/fetch).');
    return;
  }

  // 2. Redeem.
  const res = await fetch(`${API}/audit`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'X-Payment': txHash },
    body:    JSON.stringify({ repo, tier }),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({})) as { error?: string; detail?: string };
    console.error(`scan failed (${res.status}): ${b.detail ?? b.error ?? 'unknown'}`);
    process.exit(1);
  }

  const r = await res.json() as AuditReport;

  console.log(`\n${r.meta.repo}  @${r.meta.commitSha.slice(0, 8)}   ${r.summary.verdict}   [${r.tier}]`);
  console.log('─'.repeat(72));

  for (const sev of SEV_ORDER) {
    const group = r.findings.filter(f => f.severity === sev);
    for (const f of group) {
      console.log(`\n[${f.severity}/${f.confidence ?? 'HIGH'}] ${f.id}  ${f.title}`);
      console.log(`  ${f.location}`);
      if (f.refs?.length) console.log(`  refs: ${f.refs.join(', ')}`);
      console.log(`  fix: ${f.fix.split('. ')[0]}.`);
    }
  }

  const warn = honestyChecks(r);
  if (warn.length) {
    console.log('\n' + '─'.repeat(72));
    console.log('Limits of this result:');
    for (const w of warn) console.log(`  ! ${w}`);
  }
  if (r.notAnalysed) {
    console.log(`  ! ${r.notAnalysed.crossFile}`);
  }
}

main().catch(e => { console.error('failed:', e.message); process.exit(1); });
