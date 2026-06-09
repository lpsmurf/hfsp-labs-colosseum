export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export interface Finding {
  id:       string;
  severity: Severity;
  title:    string;
  detail:   string;
  location: string;
  fix:      string;
}

export interface AuditReport {
  meta: {
    repo:         string;
    commitSha:    string;
    liveEndpoint: string | null;
    auditedAt:    string;
    staticFiles:  number;
    dynamicProbes: boolean;
  };
  summary: {
    critical: number;
    high:     number;
    medium:   number;
    low:      number;
    info:     number;
    total:    number;
    verdict:  'CLEAN' | 'ISSUES_FOUND' | 'CRITICAL_ISSUES';
  };
  findings: Finding[];
}

const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1,
};

export function buildReport(
  repo:          string,
  commitSha:     string,
  liveEndpoint:  string | null,
  staticFiles:   number,
  dynamicProbes: boolean,
  findings:      Finding[],
): AuditReport {
  // Deduplicate by id+location
  const seen = new Set<string>();
  const unique = findings.filter(f => {
    const key = `${f.id}::${f.location}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by severity descending
  unique.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);

  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of unique) {
    counts[f.severity.toLowerCase() as keyof typeof counts]++;
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
    },
    summary: { ...counts, total: unique.length, verdict },
    findings: unique,
  };
}
