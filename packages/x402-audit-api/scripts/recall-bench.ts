/**
 * Recall benchmark against the evmbench / frontier-evals corpus.
 *
 *   npx tsx scripts/recall-bench.ts <path-to-frontier-evals> <path-to-cloned-corpus>
 *
 * Why this exists: precision is well measured (OpenZeppelin ceiling, four
 * heavily-audited protocols with zero CRITICAL/HIGH) but recall was pure
 * guesswork. A tool that flags nothing has perfect precision and is useless.
 *
 * Corpus: 40 Code4rena/Sherlock-style audit contests, 118 gold vulnerabilities
 * that real auditors were paid for. Source is cloned from evmbench-org rather
 * than fetched over the API, because 40 audits x ~131 requests would exceed the
 * hourly GitHub budget.
 *
 * Fidelity: file selection goes through the product's own selectFiles(), so the
 * bench sees exactly the files a paid audit would — including the 120-file cap.
 * A bug in file 300 of a large repo is a real miss, not a rule gap, and the
 * harness must not paper over that.
 *
 * Matching is deliberately GENEROUS. A gold vulnerability counts as "reached" if
 * we produced any finding in a file the official fix touched. That is an upper
 * bound on recall, not recall: flagging the right file for the wrong reason
 * counts. It is the cheap number to compute, and if the upper bound is small the
 * true figure is smaller still, so no hand-reading of 118 findings is needed to
 * know where we stand.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeStatic } from '../src/static/index.js';
import { selectFiles } from '../src/github.js';
import type { Finding } from '../src/report.js';

interface GoldVuln {
  audit:  string;
  id:     string;
  title:  string;
  /** Files the official patch touched, or that the gold writeup names. */
  files:  Set<string>;
  award?: number;
}

// ---------------------------------------------------------------------------

function walk(dir: string, base = dir, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else out.push(relative(base, p));
  }
  return out;
}

// A tiny reader for the subset of YAML these configs use. Pulling in a YAML
// dependency for `id:`, `title:` and a nested mapping is not worth it.
function parseConfig(text: string): { vulns: Array<{ id: string; title: string; patch: string[]; award?: number }> } {
  const vulns: Array<{ id: string; title: string; patch: string[]; award?: number }> = [];
  const lines = text.split('\n');
  let inVulns = false;
  let cur: { id: string; title: string; patch: string[]; award?: number } | null = null;
  let inPatchMap = false;

  for (const raw of lines) {
    if (/^vulnerabilities:/.test(raw)) { inVulns = true; continue; }
    if (!inVulns) continue;
    if (/^\w/.test(raw)) break;                   // back to a top-level key

    const idM = /^\s*-\s*id:\s*"?([^"\n]+?)"?\s*$/.exec(raw);
    if (idM) {
      if (cur) vulns.push(cur);
      cur = { id: idM[1], title: '', patch: [] };
      inPatchMap = false;
      continue;
    }
    if (!cur) continue;

    const tM = /^\s*title:\s*"?(.*?)"?\s*$/.exec(raw);
    if (tM) { cur.title = tM[1]; inPatchMap = false; continue; }

    const aM = /^\s*award:\s*([\d.]+)/.exec(raw);
    if (aM) { cur.award = Number(aM[1]); inPatchMap = false; continue; }

    if (/^\s*patch_path_mapping:/.test(raw)) { inPatchMap = true; continue; }
    if (/^\s*\w+(_\w+)*:/.test(raw) && !/^\s*"/.test(raw)) { inPatchMap = false; }

    if (inPatchMap) {
      const pM = /:\s*"([^"]+)"\s*$/.exec(raw);
      if (pM) cur.patch.push(pM[1]);
    }
  }
  if (cur) vulns.push(cur);
  return { vulns };
}

function loadGold(feRoot: string): GoldVuln[] {
  const auditsDir = join(feRoot, 'project', 'evmbench', 'audits');
  const out: GoldVuln[] = [];

  for (const audit of readdirSync(auditsDir).filter(a => /^20/.test(a)).sort()) {
    const cfg = join(auditsDir, audit, 'config.yaml');
    if (!existsSync(cfg)) continue;

    for (const v of parseConfig(readFileSync(cfg, 'utf8')).vulns) {
      const files = new Set<string>(v.patch);

      // Second signal: .sol filenames named in the gold writeup. Raises file
      // coverage from 38% to 88% of the corpus.
      const md = join(auditsDir, audit, 'findings', `${v.id}.md`);
      if (existsSync(md)) {
        const txt = readFileSync(md, 'utf8');
        for (const m of txt.matchAll(/([A-Z][\w]*\.sol)/g)) files.add(m[1]);
      }

      out.push({ audit, id: v.id, title: v.title, files, award: v.award });
    }
  }
  return out;
}

// A gold file reference may be a full path or a bare filename; a finding
// location may carry a " → fn()" suffix. Compare on basename.
const basename = (p: string) => p.split(' → ')[0].split('/').pop() ?? p;

// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// The corpus split.
//
// Rules are derived from one half and measured on both. Reporting only the
// derive number would make memorisation look like capability: a rule written
// from a finding will of course reach that finding. The holdout half has never
// been read, so its number is the honest one — and a rule that lifts the first
// and not the second gets reverted.
// See x402-audit/experiments/README.md.
// ---------------------------------------------------------------------------

type Half = 'derive' | 'holdout';

function loadSplit(): Record<string, Half> {
  const path = join(
    dirname(fileURLToPath(import.meta.url)),
    '..', '..', '..', 'x402-audit', 'experiments', 'corpus-split.json',
  );
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<Half, string[]>;
  const map: Record<string, Half> = {};
  for (const half of ['derive', 'holdout'] as Half[]) {
    for (const a of raw[half]) map[a] = half;
  }
  return map;
}

interface Stats {
  audits:        number;
  files:         number;
  findings:      number;
  scored:        number;
  noSignal:      number;
  reached:       number;
  reachedLoud:   number;
  chance:        number;
  chanceLoud:    number;
  /** Gold vulns reached specifically by the rules under --rules, if given. */
  reachedTarget: number;
}

const zero = (): Stats => ({
  audits: 0, files: 0, findings: 0, scored: 0, noSignal: 0,
  reached: 0, reachedLoud: 0, chance: 0, chanceLoud: 0, reachedTarget: 0,
});

function report(label: string, s: Stats, targetLabel: string | null) {
  const pct = (n: number) => s.scored ? (100 * n / s.scored).toFixed(1) + '%' : 'n/a';
  const lift = (n: number, c: number) => c ? (n / c).toFixed(2) + 'x' : 'n/a';

  console.log(`\n${'='.repeat(70)}`);
  console.log(`${label}  —  ${s.audits} audits, ${s.files} files, ${s.findings} findings`);
  console.log('-'.repeat(70));
  console.log(`gold scorable          ${s.scored}   (+${s.noSignal} with no file signal)`);
  console.log(`reached, any finding   ${s.reached} / ${s.scored} = ${pct(s.reached)}` +
              `   chance ${pct(s.chance)}   lift ${lift(s.reached, s.chance)}`);
  console.log(`reached, CRITICAL/HIGH ${s.reachedLoud} / ${s.scored} = ${pct(s.reachedLoud)}` +
              `   chance ${pct(s.chanceLoud)}   lift ${lift(s.reachedLoud, s.chanceLoud)}`);
  if (targetLabel) {
    console.log(`reached by ${targetLabel.padEnd(11)} ${s.reachedTarget} / ${s.scored} = ${pct(s.reachedTarget)}`);
  }
}

async function main() {
  const args       = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const [feRoot, corpusRoot] = args;
  // Restrict the "reached by" column to specific rule ids, so a newly added
  // engine can be credited on its own rather than hidden inside the total.
  const rulesArg   = process.argv.find(a => a.startsWith('--rules='))?.split('=')[1];
  const rules      = rulesArg ? rulesArg.split(',') : null;
  const verbose    = process.argv.includes('--verbose');

  if (!feRoot || !corpusRoot) {
    console.error('usage: tsx scripts/recall-bench.ts <frontier-evals-root> <corpus-root> [--rules=SOL-AC,SOL-MATH] [--verbose]');
    process.exit(1);
  }

  const split = loadSplit();
  const gold  = loadGold(feRoot);
  const byAudit = new Map<string, GoldVuln[]>();
  for (const g of gold) {
    if (!byAudit.has(g.audit)) byAudit.set(g.audit, []);
    byAudit.get(g.audit)!.push(g);
  }

  const stats: Record<Half, Stats> = { derive: zero(), holdout: zero() };
  const sevCount: Record<string, number> = {};
  const unsplit: string[] = [];
  const targetHits: string[] = [];
  let skipped = 0;
  const rows: string[] = [];

  for (const [audit, vulns] of [...byAudit].sort()) {
    const half = split[audit];
    if (!half) { unsplit.push(audit); continue; }

    const repo = join(corpusRoot, audit);
    if (!existsSync(repo) || !statSync(repo).isDirectory()) {
      skipped += vulns.length;
      rows.push(`${half[0]} ${audit.padEnd(36)} —      repo not cloned`);
      continue;
    }

    const files = selectFiles(walk(repo))
      .map(p => {
        try { return { path: p, content: readFileSync(join(repo, p), 'utf8') }; }
        catch { return null; }
      })
      .filter((f): f is { path: string; content: string } => f !== null);

    const { findings } = await analyzeStatic(files);
    const s = stats[half];

    const hitFiles  = new Set(findings.map((f: Finding) => basename(f.location)));
    const loud      = findings.filter((f: Finding) => f.severity === 'CRITICAL' || f.severity === 'HIGH');
    const loudFiles = new Set(loud.map((f: Finding) => basename(f.location)));
    const targeted  = rules ? findings.filter((f: Finding) => rules.some(r => f.id.startsWith(r))) : [];
    const targetFiles = new Set(targeted.map((f: Finding) => basename(f.location)));

    // Control. With ~27 findings per audit, landing on the right file by
    // accident is common, so the raw reach number means nothing alone.
    const withSignal = vulns.filter(v => v.files.size > 0).length;
    s.chance     += (files.length ? hitFiles.size  / files.length : 0) * withSignal;
    s.chanceLoud += (files.length ? loudFiles.size / files.length : 0) * withSignal;

    for (const f of findings) sevCount[f.severity] = (sevCount[f.severity] ?? 0) + 1;
    s.audits++;
    s.files    += files.length;
    s.findings += findings.length;

    let aReached = 0, aNoSignal = 0;
    for (const v of vulns) {
      if (v.files.size === 0) { aNoSignal++; s.noSignal++; continue; }
      const names = [...v.files].map(basename);
      s.scored++;
      if (names.some(n => hitFiles.has(n)))  { aReached++; s.reached++; }
      if (names.some(n => loudFiles.has(n))) s.reachedLoud++;
      if (names.some(n => targetFiles.has(n))) {
        s.reachedTarget++;
        const where = targeted.filter(f => names.includes(basename(f.location)));
        targetHits.push(
          `  [${half}] ${audit} ${v.id}: ${v.title.slice(0, 64)}\n` +
          where.map(f => `        ${f.id}  ${f.location}`).join('\n'),
        );
      }
    }

    rows.push(
      `${half[0]} ${audit.padEnd(36)} ${String(files.length).padStart(3)} files  ` +
      `${String(findings.length).padStart(3)} findings  ${aReached}/${vulns.length} reached` +
      (aNoSignal ? `  (${aNoSignal} no signal)` : ''),
    );
  }

  if (verbose) console.log('\n' + rows.join('\n'));

  const label = rules ? rules.join(',') : null;
  report('DERIVE HALF   (rules were written from these)', stats.derive, label);
  report('HOLDOUT HALF  (never read — the honest number)', stats.holdout, label);

  if (label && targetHits.length) {
    console.log(`\n${'='.repeat(70)}\ngold vulnerabilities reached by ${label}:\n`);
    console.log(targetHits.join('\n'));
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log('findings by severity:', JSON.stringify(sevCount));
  if (skipped)        console.log(`gold skipped (repo not cloned): ${skipped}`);
  if (unsplit.length) console.log(`audits absent from the split: ${unsplit.join(', ')}`);
  console.log(
    '\n"Reached" means we flagged something in a file the official fix touched.\n' +
    'It counts flagging the right file for the wrong reason, so it is a ceiling,\n' +
    'not recall. Compare the two halves: a derive number well above the holdout\n' +
    'number is memorisation, not capability.',
  );
}

main().catch(e => { console.error(e); process.exit(1); });
