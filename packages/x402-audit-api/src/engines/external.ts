import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { promisify } from 'node:util';
import type { RepoFile } from '../github.js';
import type { Finding, Severity } from '../report.js';

const exec = promisify(execFile);

// ─────────────────────────────────────────────────────────────────────────────
// Optional external scanners — gitleaks + semgrep.
//
// These run only when the binary is on PATH; otherwise they no-op so the
// service degrades gracefully (the in-memory secrets/sast modules still run).
//   - gitleaks  https://github.com/gitleaks/gitleaks   (full secret ruleset)
//   - semgrep   (Trail of Bits static-analysis workflow uses this heavily)
//
// The fetched repo files are materialised into a throwaway temp dir, scanned,
// and the dir is removed. Nothing leaves the host.
// ─────────────────────────────────────────────────────────────────────────────

const TOOL_TIMEOUT_MS = 25_000;

async function hasBinary(bin: string): Promise<boolean> {
  try {
    await exec(bin, ['--version'], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

async function materialize(files: RepoFile[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'x402audit-'));
  await Promise.all(
    files.map(async (f) => {
      // Defend against path traversal in the (untrusted) repo paths.
      const safe = f.path.replace(/\\/g, '/').replace(/(^|\/)\.\.(\/|$)/g, '/');
      const dest = join(dir, safe);
      if (!dest.startsWith(dir)) return;
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, f.content);
    }),
  );
  return dir;
}

function mapSeverity(s: string): Severity {
  const v = s.toUpperCase();
  if (v === 'CRITICAL' || v === 'ERROR') return 'HIGH';
  if (v === 'HIGH') return 'HIGH';
  if (v === 'WARNING' || v === 'MEDIUM') return 'MEDIUM';
  if (v === 'LOW' || v === 'INFO' || v === 'NOTE') return 'LOW';
  return 'MEDIUM';
}

async function runGitleaks(dir: string): Promise<Finding[]> {
  const out = join(dir, '__gitleaks.json');
  try {
    // gitleaks exits non-zero when leaks are found — that's expected.
    await exec('gitleaks', ['dir', dir, '--report-format', 'json', '--report-path', out, '--no-banner', '--exit-code', '0'], {
      timeout: TOOL_TIMEOUT_MS,
      maxBuffer: 16 * 1024 * 1024,
    }).catch(() => undefined);
    const raw = await import('node:fs/promises').then((fs) => fs.readFile(out, 'utf8')).catch(() => '[]');
    const leaks = JSON.parse(raw || '[]') as Array<{ RuleID?: string; Description?: string; File?: string; StartLine?: number }>;
    return leaks.map((l) => ({
      id:       `GITLEAKS-${l.RuleID ?? 'secret'}`,
      severity: 'CRITICAL' as Severity,
      title:    `Secret detected by gitleaks: ${l.Description ?? l.RuleID ?? 'secret'}`,
      detail:   `gitleaks matched rule "${l.RuleID}" in \`${l.File}\`${l.StartLine ? `:${l.StartLine}` : ''}. Treat as a live credential until proven otherwise.`,
      location: `${l.File ?? 'unknown'}${l.StartLine ? `:${l.StartLine}` : ''}`,
      fix:      'Rotate the credential, remove it from the code, move it to an env var, and purge it from git history.',
    }));
  } catch {
    return [];
  }
}

async function runSemgrep(dir: string): Promise<Finding[]> {
  try {
    const { stdout } = await exec(
      'semgrep',
      ['--config', 'auto', '--json', '--quiet', '--timeout', '20', '--max-target-bytes', '2000000', dir],
      { timeout: TOOL_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 },
    ).catch((e: { stdout?: string }) => ({ stdout: e?.stdout ?? '{"results":[]}' }));

    const parsed = JSON.parse(stdout || '{"results":[]}') as {
      results?: Array<{ check_id?: string; path?: string; start?: { line?: number }; extra?: { message?: string; severity?: string } }>;
    };
    return (parsed.results ?? []).map((r) => ({
      id:       `SEMGREP-${(r.check_id ?? 'rule').split('.').pop()}`,
      severity: mapSeverity(r.extra?.severity ?? 'WARNING'),
      title:    `semgrep: ${r.extra?.message?.slice(0, 100) ?? r.check_id ?? 'finding'}`,
      detail:   `semgrep rule "${r.check_id}" flagged \`${r.path}\`${r.start?.line ? `:${r.start.line}` : ''}. ${r.extra?.message ?? ''}`.trim(),
      location: `${r.path ?? 'unknown'}${r.start?.line ? `:${r.start.line}` : ''}`,
      fix:      'Review the semgrep finding and apply the rule-specific remediation. See https://semgrep.dev for rule detail.',
    }));
  } catch {
    return [];
  }
}

/**
 * Run any external scanners that are installed. Returns [] (never throws) when
 * no binaries are available, so callers can always Promise.all this in.
 */
export async function runExternalEngines(files: RepoFile[]): Promise<Finding[]> {
  if (!files.length) return [];

  const [gitleaksOk, semgrepOk] = await Promise.all([hasBinary('gitleaks'), hasBinary('semgrep')]);
  if (!gitleaksOk && !semgrepOk) return [];

  let dir: string | null = null;
  try {
    dir = await materialize(files);
    const tasks: Promise<Finding[]>[] = [];
    if (gitleaksOk) tasks.push(runGitleaks(dir));
    if (semgrepOk)  tasks.push(runSemgrep(dir));
    const results = await Promise.all(tasks);
    return results.flat();
  } catch {
    return [];
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
