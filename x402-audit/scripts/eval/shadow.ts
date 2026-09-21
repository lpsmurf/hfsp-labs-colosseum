#!/usr/bin/env npx tsx
/**
 * Shadow-mode scoreboard: regex scanner vs Jev, judged by manual verification.
 *
 * Jev never changes findings. We keep verifying hits by hand as before, record
 * the verdict here, and switch to Jev only once the readiness gate passes.
 *
 * Usage:
 *   npx tsx eval/shadow.ts todo                      # what to verify next (disagreements first)
 *   npx tsx eval/shadow.ts label <id> real|fp [note]  # record a manual verdict
 *   npx tsx eval/shadow.ts report                    # accuracy + readiness gate
 */

import { appendFileSync, existsSync, readFileSync } from 'fs';
import { DEFAULT_THRESHOLDS, decide } from '../lib/typesafe-triage';
import { disagrees, SHADOW_LABELS, SHADOW_LOG, type ShadowLabel, type ShadowRow } from './shadow-log';

// Switch-over gate. Real findings are rare, so demand a minimum of them too.
const GATE = { minLabeled: 50, minReal: 5, maxMissedReal: 0, maxReviewShare: 0.2 };

function readJsonl<T>(file: string): T[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l) as T);
}

/** Latest verdict per endpoint+check, re-decided from the logged probabilities with current thresholds. */
function latestRows(): ShadowRow[] {
  const byId = new Map<string, ShadowRow>();
  for (const r of readJsonl<ShadowRow>(SHADOW_LOG)) {
    const decision = decide(r.check, r.jev, DEFAULT_THRESHOLDS);
    byId.set(r.id, { ...r, jev: { ...r.jev, decision }, disagree: disagrees(r.regexFlag, decision) });
  }
  return [...byId.values()];
}

function labels(): Map<string, ShadowLabel> {
  const m = new Map<string, ShadowLabel>();
  for (const l of readJsonl<ShadowLabel>(SHADOW_LABELS)) m.set(l.id, l);
  return m;
}

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : '—');
const describe = (r: ShadowRow) =>
  `${r.id}  ${r.check.padEnd(12)} regex=${r.regexFlag ? 'flag' : 'pass'}  jev=${r.jev.decision.padEnd(7)} ${r.jev.findingClass}@${r.jev.classConfidence.toFixed(2)}  ${r.url}`;

function todo() {
  const lab = labels();
  const open = latestRows().filter(r => !lab.has(r.id));
  // Disagreements first, then regex hits (already on the manual queue), then the rest.
  open.sort((a, b) => Number(b.disagree) - Number(a.disagree) || Number(b.regexFlag) - Number(a.regexFlag));
  if (!open.length) return console.log('Nothing to verify — run security-probe.ts --shadow to collect more.');
  console.log(`${open.length} unlabeled (${open.filter(r => r.disagree).length} disagreements):\n`);
  for (const r of open) console.log(`${r.disagree ? '⚡' : ' '} ${describe(r)}`);
  console.log('\nVerify by hand, then: npx tsx eval/shadow.ts label <id> real|fp "note"');
}

function label(id: string | undefined, verdict: string | undefined, note: string | undefined) {
  const row = latestRows().find(r => r.id === id);
  if (!row || (verdict !== 'real' && verdict !== 'fp')) {
    console.error('usage: shadow.ts label <id> real|fp [note]   (ids from `todo`)');
    process.exit(1);
  }
  const l: ShadowLabel = { id: row.id, real: verdict === 'real', note, labeledAt: new Date().toISOString() };
  appendFileSync(SHADOW_LABELS, JSON.stringify(l) + '\n');
  console.log(`labeled ${describe(row)} → ${verdict}`);
}

function report() {
  const lab = labels();
  const rows = latestRows();
  const done = rows.filter(r => lab.has(r.id)).map(r => ({ r, real: lab.get(r.id)!.real }));
  const real = done.filter(x => x.real);
  const fake = done.filter(x => !x.real);

  // Regex: flag = "report it". Jev: confirm = report, dismiss = drop, review = still needs a human.
  const regexMissed = real.filter(x => !x.r.regexFlag);
  const regexFp = fake.filter(x => x.r.regexFlag);
  const jevMissed = real.filter(x => x.r.jev.decision === 'dismiss');
  const jevFp = fake.filter(x => x.r.jev.decision === 'confirm');
  const jevReview = done.filter(x => x.r.jev.decision === 'review');
  const jevRight = done.filter(x => (x.real ? x.r.jev.decision === 'confirm' : x.r.jev.decision === 'dismiss'));
  const regexRight = done.filter(x => x.real === x.r.regexFlag);

  console.log(`Shadow log: ${rows.length} endpoint checks · ${done.length} manually verified (${real.length} real, ${fake.length} FP) · ${rows.filter(r => r.disagree).length} disagreements\n`);
  console.log('                   regex     jev');
  console.log(`  correct          ${pct(regexRight.length, done.length).padEnd(9)} ${pct(jevRight.length, done.length)}`);
  console.log(`  missed real      ${String(regexMissed.length).padEnd(9)} ${jevMissed.length}`);
  console.log(`  false positives  ${String(regexFp.length).padEnd(9)} ${jevFp.length}`);
  console.log(`  needs human      ${pct(done.filter(x => x.r.regexFlag).length, done.length).padEnd(9)} ${pct(jevReview.length, done.length)}   (regex: every flag is hand-verified)`);

  const wrong = done.filter(x => x.r.jev.decision !== 'review' && !jevRight.includes(x));
  if (wrong.length) {
    console.log('\n  Jev wrong:');
    for (const x of wrong) console.log(`    ${x.real ? 'REAL' : 'FP  '} ${describe(x.r)}${lab.get(x.r.id)!.note ? `  — ${lab.get(x.r.id)!.note}` : ''}`);
  }

  const reasons: string[] = [];
  if (done.length < GATE.minLabeled) reasons.push(`${done.length}/${GATE.minLabeled} verified checks`);
  if (real.length < GATE.minReal) reasons.push(`${real.length}/${GATE.minReal} real findings verified`);
  if (jevMissed.length > GATE.maxMissedReal) reasons.push(`Jev dismissed ${jevMissed.length} real finding(s)`);
  if (jevFp.length > regexFp.length) reasons.push(`Jev confirmed more FPs than regex flags (${jevFp.length} > ${regexFp.length})`);
  if (done.length && jevReview.length / done.length > GATE.maxReviewShare) reasons.push(`review load ${pct(jevReview.length, done.length)} > ${GATE.maxReviewShare * 100}%`);
  console.log(`\nSwitch-over gate: ${reasons.length ? 'NOT READY — ' + reasons.join('; ') : 'READY — Jev can replace manual triage of scanner hits'}`);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'todo') todo();
else if (cmd === 'label') label(rest[0], rest[1], rest.slice(2).join(' ') || undefined);
else if (cmd === 'report') report();
else console.log('usage: npx tsx eval/shadow.ts todo | label <id> real|fp [note] | report');
