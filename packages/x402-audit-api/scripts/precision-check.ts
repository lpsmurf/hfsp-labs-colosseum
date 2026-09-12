/**
 * Precision check for one or more locally cloned repositories.
 *
 *   npx tsx scripts/precision-check.ts <dir-of-clones> [RULE-PREFIX ...]
 *
 * Why a separate script from recall-bench: recall asks "how much do we find",
 * precision asks "how much of what we find is real", and the second needs
 * heavily-audited code rather than a bug corpus. Four protocols that have been
 * through multiple paid audits should produce almost nothing; whatever they do
 * produce has to be read by hand, which is why this prints locations rather
 * than only counts.
 *
 * File selection goes through the product's own selectFiles(), 120-file cap
 * included, so a rule that looks precise here is precise in a paid audit.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { analyzeStatic } from '../src/static/index.js';
import { accessControlInventory } from '../src/static/access-control.js';
import { selectFiles } from '../src/github.js';

function walk(dir: string, base = dir, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else out.push(relative(base, p));
  }
  return out;
}

async function main() {
  const root     = process.argv[2];
  const prefixes = process.argv.slice(3);
  if (!root) {
    console.error('usage: tsx scripts/precision-check.ts <dir-of-clones> [RULE-PREFIX ...]');
    process.exit(1);
  }

  const keep = (id: string) =>
    prefixes.length === 0 || prefixes.some(p => id.startsWith(p));

  for (const name of readdirSync(root)) {
    const dir = join(root, name);
    if (!statSync(dir).isDirectory()) continue;

    const files = selectFiles(walk(dir))
      .map(p => {
        try { return { path: p, content: readFileSync(join(dir, p), 'utf8') }; }
        catch { return null; }
      })
      .filter((f): f is { path: string; content: string } => f !== null);

    const { findings } = await analyzeStatic(files);
    const mine = findings.filter(f => keep(f.id));
    const surface = accessControlInventory(files);

    console.log(`\n=== ${name}  (${files.length} files)`);
    console.log(`    surface: ${surface.total} external state-changing fns, ` +
                `${surface.guarded} guarded, ${surface.unguarded} open`);
    console.log(`    findings: ${mine.length}${prefixes.length ? ` matching ${prefixes.join(',')}` : ''}`);

    for (const f of mine) {
      console.log(`      [${f.severity}/${f.confidence}] ${f.id}  ${f.location}`);
    }
  }
}

main();
