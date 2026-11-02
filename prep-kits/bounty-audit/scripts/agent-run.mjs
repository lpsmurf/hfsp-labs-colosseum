#!/usr/bin/env node
/**
 * agent-run.mjs — dispatch one bounded audit task to a provider chain with
 * refusal / rate-limit detection, fallback, and per-run metrics.
 *
 * Usage:
 *   node agent-run.mjs --packet task.md --role surface-reviewer \
 *     --workdir /path/to/clean-room --out metrics/run-001 \
 *     [--providers codex,claude] [--dry-run]
 *
 * Providers:
 *   codex   `codex exec` (read-only sandbox, non-interactive)
 *   claude  `claude -p` (--output-format json for token telemetry)
 *   devin   emits a dispatch note for the parent Devin session to pick up;
 *           the script cannot spawn Devin subagents itself.
 *   kimi    currently uninstalled — config hook, not wired until present.
 *
 * Exit classification (written to metrics, drives fallback):
 *   success        real output produced
 *   refusal        policy/safety decline detected in output
 *   rate-limited   provider quota exhausted (NOT a refusal — may reset)
 *   auth-error     login/config problem (do not retry until fixed)
 *   crash          non-zero exit with no refusal/limit signature
 *
 * A refusal or rate-limit triggers a retry of the IDENTICAL packet on the
 * next provider. Never reframe the task to evade a filter — security-audit
 * purpose is stated truthfully to every provider.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REFUSAL_PATTERNS = [
  /i (?:can'?t|cannot|can’t|won'?t|won’t|must decline to) (?:help|assist|provide|analyze|audit|review)/i,
  /i'?m (?:not able|unable) to (?:help|assist|provide|review|audit)/i,
  /against (?:my|the) (?:usage |safety )?(?:policy|policies|guidelines)/i,
  /violat\w+ (?:the )?(?:usage|acceptable.use|safety) (?:policy|policies)/i,
  /decline to (?:perform|assist|engage|participate)/i,
  /not something i can (?:help|assist) with/i,
  /refus(?:e|ing|al) to (?:assist|help|engage)/i,
  /safety filter|content (?:policy|filter) triggered/i,
];
const RATE_LIMIT_PATTERNS = [
  /usage limit|weekly limit|hit your .* limit|rate.?limit/i,
  /too many requests|quota (?:exceeded|exhausted)/i,
  /try again (?:at|in) |resets? (?:at|on|in) /i,
  /purchase more credits|upgrade to pro/i,
];
const AUTH_PATTERNS = [
  /not (?:logged in|authenticated)|unauthorized|invalid (?:api )?key/i,
  /login required|auth(?:entication)? (?:failed|error)|401/i,
];

const PROVIDERS = {
  codex: (packetPath, workdir) => ({
    cmd: 'codex',
    args: ['exec', '--skip-git-repo-check', '--sandbox', 'read-only',
           '--cd', workdir, `Read ${packetPath} and execute it exactly.`],
    // codex streams text to stdout; final answer after 'codex' marker.
    parse: (out) => out,
  }),
  claude: (packetPath, workdir) => ({
    cmd: 'claude',
    args: ['-p', `Read ${packetPath} and execute it exactly.`,
           '--output-format', 'json',
           '--allowedTools', 'Read,Grep,Glob,Bash(ls:*),Bash(cat:*),Bash(rg:*),Bash(find:*)',
           '--add-dir', workdir],
    parse: (out) => {
      try { const j = JSON.parse(out); return { text: j.result ?? '', usage: j.usage, isError: j.is_error }; }
      catch { return { text: out }; }
    },
  }),
  kimi: () => null, // not installed — kept as chain slot
};

function classify(exitCode, text) {
  const t = String(text ?? '');
  if (AUTH_PATTERNS.some((r) => r.test(t))) return 'auth-error';
  if (RATE_LIMIT_PATTERNS.some((r) => r.test(t))) return 'rate-limited';
  if (REFUSAL_PATTERNS.some((r) => r.test(t))) return 'refusal';
  if (exitCode !== 0) return 'crash';
  if (!t.trim()) return 'crash'; // empty success = unusable
  return 'success';
}

function runProvider(name, packetPath, workdir, outDir) {
  const spec = PROVIDERS[name]?.(packetPath, workdir);
  if (!spec) return { provider: name, status: 'unavailable' };
  const res = spawnSync(spec.cmd, spec.args, {
    cwd: workdir, encoding: 'utf8', timeout: 900_000, maxBuffer: 64 * 1024 * 1024,
  });
  const stdout = res.stdout ?? '';
  const stderr = res.stderr ?? '';
  writeFileSync(join(outDir, `${name}.stdout.log`), stdout);
  writeFileSync(join(outDir, `${name}.stderr.log`), stderr);
  const parsed = spec.parse(stdout);
  const text = typeof parsed === 'string' ? parsed : parsed.text;
  const status = classify(res.status ?? (res.error ? 1 : 0), text + '\n' + stderr);
  return {
    provider: name, status, exitCode: res.status, text,
    usage: typeof parsed === 'object' ? parsed.usage : undefined,
    error: res.error?.message,
  };
}

function main() {
  const args = process.argv.slice(2);
  const get = (flag, def) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : def; };
  const packet = resolve(get('--packet', ''));
  const role = get('--role', 'unnamed');
  const workdir = resolve(get('--workdir', '.'));
  const outDir = resolve(get('--out', `metrics/${Date.now()}`));
  const chain = (get('--providers', 'codex,claude') || '').split(',').map(s => s.trim()).filter(Boolean);
  const dryRun = args.includes('--dry-run');

  if (!packet || !existsSync(packet)) { console.error(`packet not found: ${packet}`); process.exit(2); }
  mkdirSync(outDir, { recursive: true });

  const packetText = readFileSync(packet, 'utf8');
  const packetHash = createHash('sha256').update(packetText).digest('hex').slice(0, 16);
  console.log(`[agent-run] role=${role} packet=${packetHash} providers=${chain.join('→')}`);

  if (dryRun) { console.log('[agent-run] dry-run; no provider invoked'); return; }

  const attempts = [];
  let final = null;
  for (const p of chain) {
    const r = runProvider(p, packet, workdir, outDir);
    attempts.push({ provider: p, status: r.status, exitCode: r.exitCode,
                    usage: r.usage ?? null, error: r.error ?? null });
    console.log(`[agent-run] ${p}: ${r.status}${r.exitCode != null ? ` exit=${r.exitCode}` : ''}`);
    if (r.status === 'success') { final = r; break; }
    if (r.status === 'auth-error' || r.status === 'unavailable') continue; // next provider
    if (r.status === 'refusal' || r.status === 'rate-limited' || r.status === 'crash') continue;
  }

  const record = {
    ts: new Date().toISOString(), role, packet: packetHash, workdir,
    attempts, outcome: final ? `success:${final.provider}` : 'blocked:provider-chain-exhausted',
  };
  appendFileSync(join(outDir, 'run-metrics.jsonl'), JSON.stringify(record) + '\n');
  writeFileSync(join(outDir, 'result.txt'), final ? final.text :
    `BLOCKED — all providers failed. Attempts:\n${JSON.stringify(attempts, null, 2)}`);
  console.log(`[agent-run] outcome=${record.outcome} → ${join(outDir, 'result.txt')}`);
  if (!final) process.exit(3);
}

main();
