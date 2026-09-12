// T0 — free. Decide whether a paid scan is worth it.
import { API, honestyChecks } from './types.js';
import type { PreviewReport } from './types.js';

async function main() {
  const repo = process.argv[2];
  if (!repo) {
    console.error('usage: tsx scripts/audit-preview.ts <github-repo-url>');
    process.exit(1);
  }

  const res = await fetch(`${API}/audit/preview?repo=${encodeURIComponent(repo)}`);

  // 503 means the upstream GitHub budget is exhausted — retryable, not a verdict.
  if (res.status === 503) {
    const b = await res.json() as { detail?: string };
    console.error(`upstream rate limited — ${b.detail ?? 'retry later'}`);
    process.exit(2);
  }
  if (!res.ok) {
    const b = await res.json().catch(() => ({})) as { error?: string; detail?: string };
    console.error(`preview failed (${res.status}): ${b.detail ?? b.error ?? 'unknown'}`);
    process.exit(1);
  }

  const r = await res.json() as PreviewReport;
  const s = r.summary;

  console.log(`\n${repo}`);
  console.log(`commit ${r.meta.commitSha.slice(0, 8)}   verdict ${s.verdict}`);
  console.log(`\nCRITICAL ${s.critical}   HIGH ${s.high}   MEDIUM ${s.medium}   LOW ${s.low}   INFO ${s.info}`);
  console.log(`coverage: ${JSON.stringify(r.meta.coverage ?? {})}`);

  const warn = honestyChecks(r);
  if (warn.length) {
    console.log('\nBefore you act on this:');
    for (const w of warn) console.log(`  ! ${w}`);
  }

  if (s.total > 0) {
    const u = r.preview.upgrade;
    console.log(`\n${s.total} findings located. ${u.tier} ($${u.priceUsdc}) returns ${u.gets}`);
  } else {
    console.log('\nNothing flagged. Save your $0.99 — but read the caveats above.');
  }
}

main().catch(e => { console.error('failed:', e.message); process.exit(1); });
