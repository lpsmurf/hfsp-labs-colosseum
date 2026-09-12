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
import { join, relative } from 'node:path';
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

async function main() {
  const [feRoot, corpusRoot] = process.argv.slice(2);
  if (!feRoot || !corpusRoot) {
    console.error('usage: tsx scripts/recall-bench.ts <frontier-evals-root> <corpus-root>');
    process.exit(1);
  }

  const gold = loadGold(feRoot);
  const byAudit = new Map<string, GoldVuln[]>();
  for (const g of gold) {
    if (!byAudit.has(g.audit)) byAudit.set(g.audit, []);
    byAudit.get(g.audit)!.push(g);
  }

  let reached = 0, missed = 0, noSignal = 0, skipped = 0;
  let reachedLoud = 0, chanceSum = 0, chanceLoudSum = 0;
  const sevCount: Record<string, number> = {};
  let totalFindings = 0, totalFiles = 0, auditsRun = 0;
  const rows: string[] = [];

  for (const [audit, vulns] of [...byAudit].sort()) {
    const repo = join(corpusRoot, audit);
    if (!existsSync(repo) || !statSync(repo).isDirectory()) {
      skipped += vulns.length;
      rows.push(`${audit.padEnd(36)} —      repo not cloned`);
      continue;
    }

    const chosen = selectFiles(walk(repo));
    const files = chosen
      .map(p => {
        try { return { path: p, content: readFileSync(join(repo, p), 'utf8') }; }
        catch { return null; }
      })
      .filter((f): f is { path: string; content: string } => f !== null);

    const { findings } = await analyzeStatic(files);
    const hitFiles = new Set(findings.map((f: Finding) => basename(f.location)));

    // Control. With ~27 findings per audit, hitting the right file by accident
    // is likely, so the raw reach number means nothing on its own. This is the
    // probability a randomly chosen file would already be flagged.
    const flaggedFraction = files.length ? hitFiles.size / files.length : 0;
    chanceSum += flaggedFraction * vulns.filter(v => v.files.size > 0).length;

    // Same question, restricted to findings a user would actually act on.
    const loud = findings.filter((f: Finding) => f.severity === 'CRITICAL' || f.severity === 'HIGH');
    const loudFiles = new Set(loud.map((f: Finding) => basename(f.location)));
    const loudFraction = files.length ? loudFiles.size / files.length : 0;
    chanceLoudSum += loudFraction * vulns.filter(v => v.files.size > 0).length;
    for (const f of findings) sevCount[f.severity] = (sevCount[f.severity] ?? 0) + 1;

    auditsRun++;
    totalFindings += findings.length;
    totalFiles += files.length;

    let aReached = 0, aNoSignal = 0;
    for (const v of vulns) {
      if (v.files.size === 0) { aNoSignal++; noSignal++; continue; }
      const names = [...v.files].map(basename);
      if (names.some(n => hitFiles.has(n))) { aReached++; reached++; }
      else missed++;
      if (names.some(n => loudFiles.has(n))) reachedLoud++;
    }

    rows.push(
      `${audit.padEnd(36)} ${String(files.length).padStart(3)} files  ` +
      `${String(findings.length).padStart(3)} findings  ` +
      `${aReached}/${vulns.length} reached` +
      (aNoSignal ? `  (${aNoSignal} no file signal)` : ''),
    );
  }

  const scored = reached + missed;
  console.log('\n' + rows.join('\n'));
  console.log('\n' + '='.repeat(68));
  console.log(`audits analysed        ${auditsRun}`);
  console.log(`files read             ${totalFiles}`);
  console.log(`findings produced      ${totalFindings}`);
  console.log(`gold vulnerabilities   ${gold.length}`);
  console.log(`  scorable             ${scored}   (had a file signal)`);
  console.log(`  no file signal       ${noSignal}   (cannot be scored either way)`);
  if (skipped) console.log(`  skipped              ${skipped}   (repo not cloned)`);
  console.log('-'.repeat(68));
  const pct = (n: number) => scored ? (100 * n / scored).toFixed(1) + '%' : '0%';
  console.log(`REACHED (any finding)  ${reached} / ${scored}   = ${pct(reached)}`);
  console.log(`  expected by chance   ${chanceSum.toFixed(1)} / ${scored}   = ${pct(chanceSum)}`);
  console.log(`  lift over chance     ${chanceSum ? (reached / chanceSum).toFixed(2) : 'n/a'}x`);
  console.log('-'.repeat(68));
  console.log(`REACHED (CRITICAL/HIGH only)`);
  console.log(`  reached              ${reachedLoud} / ${scored}   = ${pct(reachedLoud)}`);
  console.log(`  expected by chance   ${chanceLoudSum.toFixed(1)} / ${scored}   = ${pct(chanceLoudSum)}`);
  console.log(`  lift over chance     ${chanceLoudSum ? (reachedLoud / chanceLoudSum).toFixed(2) : 'n/a'}x`);
  console.log('='.repeat(68));
  console.log('\nfindings by severity:', JSON.stringify(sevCount));
  console.log(
    '\n"Reached" means we flagged something in a file the official fix touched.\n' +
    'It counts flagging the right file for the wrong reason, so it is a ceiling,\n' +
    'not recall. The chance row is the control: with this many findings per\n' +
    'audit, landing on the right file accidentally is common. Lift near 1.0x\n' +
    'means the reach is indistinguishable from spray.',
  );
}

main().catch(e => { console.error(e); process.exit(1); });
