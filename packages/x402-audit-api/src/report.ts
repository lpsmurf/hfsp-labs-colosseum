export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

// Pattern matching cannot prove a bug, only that code looks like one. Saying so
// per finding is the difference between a report an auditor can triage and a
// list they have to re-derive from scratch.
//   HIGH   — the pattern is the bug; little judgement needed.
//   MEDIUM — the pattern is usually the bug; confirm the surrounding context.
//   LOW    — a lead worth reading, expect false positives.
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface Finding {
  id:          string;
  severity:    Severity;
  title:       string;
  detail:      string;
  location:    string;
  fix:         string;
  confidence?: Confidence;
  // Standards and prior art: SWC ids, CWE ids, or a URL an auditor can follow.
  refs?:       string[];
}

export interface AuditReport {
  meta: {
    repo:         string;
    commitSha:    string;
    liveEndpoint: string | null;
    auditedAt:    string;
    staticFiles:  number;
    dynamicProbes: boolean;
    // Files seen per language. A caller needs this to tell "we found nothing"
    // apart from "we have no rules for what this repo is written in" — Clarity
    // and Move files are fetched and counted but not yet analysed.
    coverage?:    Record<string, number>;
  };
  summary: {
    critical: number;
    high:     number;
    medium:   number;
    low:      number;
    info:     number;
    total:    number;
    // Findings below HIGH confidence — the part of the report a human still owes
    // a look before anything is reported upstream.
    needsReview: number;
    verdict:  'CLEAN' | 'ISSUES_FOUND' | 'CRITICAL_ISSUES';
  };
  findings: Finding[];
}

const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1,
};

const CONFIDENCE_RANK: Record<Confidence, number> = {
  HIGH: 3, MEDIUM: 2, LOW: 1,
};

export function buildReport(
  repo:          string,
  commitSha:     string,
  liveEndpoint:  string | null,
  staticFiles:   number,
  dynamicProbes: boolean,
  findings:      Finding[],
  coverage?:     Record<string, number>,
): AuditReport {
  // Deduplicate by id+location
  const seen = new Set<string>();
  const unique = findings.filter(f => {
    const key = `${f.id}::${f.location}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Severity descending, then confidence descending — a HIGH we are sure about
  // should outrank a HIGH we are guessing at.
  unique.sort((a, b) =>
    SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
    CONFIDENCE_RANK[b.confidence ?? 'HIGH'] - CONFIDENCE_RANK[a.confidence ?? 'HIGH']
  );

  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  let needsReview = 0;
  for (const f of unique) {
    counts[f.severity.toLowerCase() as keyof typeof counts]++;
    if ((f.confidence ?? 'HIGH') !== 'HIGH') needsReview++;
  }

  const verdict = counts.critical > 0
    ? 'CRITICAL_ISSUES'
    : unique.length > 0 ? 'ISSUES_FOUND' : 'CLEAN';

  return {
    meta: {
      repo,
      commitSha,
      liveEndpoint,
      auditedAt:    new Date().toISOString(),
      staticFiles,
      dynamicProbes,
      coverage,
    },
    summary: { ...counts, total: unique.length, needsReview, verdict },
    findings: unique,
  };
}
