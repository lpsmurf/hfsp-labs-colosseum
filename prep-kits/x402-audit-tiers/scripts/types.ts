export type Severity   = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type TierId     = 'T0' | 'T1' | 'T2' | 'T3' | 'T4';

export interface Finding {
  id:          string;
  severity:    Severity;
  confidence?: Confidence;
  title:       string;
  detail:      string;
  location:    string;
  fix:         string;
  refs?:       string[];
}

export interface AuditReport {
  meta: {
    repo:      string;
    commitSha: string;
    coverage?: Record<string, number>;
  };
  summary: {
    critical: number; high: number; medium: number; low: number; info: number;
    total: number; needsReview: number;
    verdict: 'CLEAN' | 'ISSUES_FOUND' | 'CRITICAL_ISSUES';
  };
  findings: Finding[];
  tier?:    TierId;
  notAnalysed?: {
    crossFile:     string;
    languages:     string[];
    unprovenLeads: number;
  };
}

export interface PreviewReport extends Omit<AuditReport, 'findings'> {
  findings: [];
  preview: {
    redacted: true;
    note:     string;
    upgrade:  { tier: TierId; priceUsdc: number | null; gets: string };
  };
}

export interface TierInfo {
  tier:       TierId;
  name:       string;
  priceUsdc:  number | null;
  detail:     'counts' | 'full';
  turnaround: string;
  available:  boolean;
  summary:    string;
  blockedOn?: string;
}

export const API = process.env.AUDIT_API ?? 'https://audit.hfsp.xyz';

/** Languages the platform counts but has no rules for. */
export const UNANALYSED_LANGS = ['clarity', 'move'];

/**
 * The three checks that stop a clean report being misread. Returns warnings an
 * agent should surface before acting on any audit result.
 */
export function honestyChecks(r: AuditReport | PreviewReport): string[] {
  const warn: string[] = [];

  if (r.summary.needsReview > 0) {
    warn.push(
      `${r.summary.needsReview} of ${r.summary.total} findings are below HIGH confidence — treat them as leads, not bugs.`,
    );
  }

  const cov = r.meta.coverage ?? {};
  const unanalysed = UNANALYSED_LANGS.filter(l => (cov[l] ?? 0) > 0);
  for (const l of unanalysed) {
    warn.push(
      `${cov[l]} ${l} file(s) were counted but NOT analysed — there are no ${l} rules. Zero findings here means "not checked", not "safe".`,
    );
  }

  if (r.summary.total === 0) {
    warn.push(
      'Zero findings is a screen passing, not an audit passing. This tier is file-local and cannot find logic bugs.',
    );
  }

  return warn;
}
