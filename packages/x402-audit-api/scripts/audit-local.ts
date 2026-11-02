// Audit local source folders (and optionally live endpoints) with the same
// engines the paid API runs — for checking our own services before shipping.
//
//   npx tsx scripts/audit-local.ts <dir> [<dir>…] [--endpoint https://…]… [--json] [--fail-on HIGH]
//
// Exit code is 1 when a finding at or above --fail-on (default HIGH) is found,
// so it can gate a deploy or CI job.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { analyzeStatic } from '../src/static/index.js';
import { runDynamicProbes } from '../src/dynamic/index.js';
import type { Finding } from '../src/report.js';

const args = process.argv.slice(2);
const flag = (name: string) => args.flatMap((a, i) => (a === `--${name}` && args[i + 1] ? [args[i + 1]] : []));
const dirs = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && args[i - 1] !== '--json'));
const endpoints = flag('endpoint');
const asJson = args.includes('--json');
const ORDER = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const failOn = (flag('fail-on')[0] ?? 'HIGH').toUpperCase();
if (!dirs.length && !endpoints.length) {
  console.error('usage: audit-local.ts <dir>… [--endpoint URL]… [--json] [--fail-on LEVEL]');
  process.exit(2);
}

const SKIP_DIR = /^(node_modules|dist|build|\.git|coverage|\.next|target)$/;
const files: Array<{ path: string; content: string }> = [];
for (const dir of dirs) {
  const root = resolve(dir);
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const s = statSync(p);
      if (s.isDirectory()) { if (!SKIP_DIR.test(name)) walk(p); continue; }
      if (s.size > 1_000_000) continue;
      files.push({ path: relative(process.cwd(), p), content: readFileSync(p, 'utf8') });
    }
  };
  walk(root);
}

const { findings: staticFindings, coverage } = await analyzeStatic(files);
const dynamic: Finding[] = [];
for (const url of endpoints) {
  try { dynamic.push(...await runDynamicProbes(url)); }
  catch (e) { console.error(`[dynamic] ${url}: ${(e as Error).message}`); }
}
const all = [...staticFindings, ...dynamic].sort((a, b) => ORDER.indexOf(b.severity) - ORDER.indexOf(a.severity));

if (asJson) {
  console.log(JSON.stringify({ files: files.length, coverage, endpoints, findings: all }, null, 2));
} else {
  console.log(`scanned ${files.length} files ${JSON.stringify(coverage)}${endpoints.length ? `, ${endpoints.length} endpoint(s)` : ''}`);
  for (const f of all) console.log(`\n[${f.severity}${f.confidence ? `/${f.confidence}` : ''}] ${f.id} — ${f.title}\n  at  ${f.location}\n  ${f.detail}\n  fix ${f.fix}`);
  console.log(`\n${all.length} finding(s)`);
}
process.exit(all.some(f => ORDER.indexOf(f.severity) >= ORDER.indexOf(failOn)) ? 1 : 0);
