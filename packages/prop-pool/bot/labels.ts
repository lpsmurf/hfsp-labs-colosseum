/** Human labels for soccer stat keys / predicates (mirrors src/txline/statKeys.ts). */
export const STAT_OPTIONS: { key: number; label: string }[] = [
  { key: 1, label: "Home Goals" },
  { key: 2, label: "Away Goals" },
  { key: 7, label: "Home Corners" },
  { key: 8, label: "Away Corners" },
  { key: 3, label: "Home Yellows" },
  { key: 4, label: "Away Yellows" },
];

export function statLabel(key: number): string {
  return STAT_OPTIONS.find((s) => s.key === key)?.label ?? `stat ${key}`;
}

export function comparisonLabel(c: any): string {
  if (c && "greaterThan" in c) return "over";
  if (c && "lessThan" in c) return "under";
  if (c && "equalTo" in c) return "exactly";
  return "?";
}

export function propSummary(p: any): string {
  return `${statLabel(p.statKey)} ${comparisonLabel(p.comparison)} ${p.threshold}`;
}
