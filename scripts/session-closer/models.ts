import { z } from "zod";

// Base schemas
const AgentNameSchema = z.enum(["Claude", "Codex", "Gemini", "Kimi"]);
const AgentStatusSchema = z.enum(["in_progress", "complete", "blocked", "no_commits"]);
const RelationshipSchema = z.enum(["waiting_for", "provides_to", "conflicts_with"]);
const DependencyStatusSchema = z.enum(["active", "resolved", "resolved_work_around"]);

// Agent metrics
export const AgentMetricsSchema = z.object({
  name: AgentNameSchema,
  prefix: z.string(),
  commits: z.number().nonnegative(),
  files_changed: z.array(z.string()),
  files_count: z.number().nonnegative(),
  lines_added: z.number().nonnegative(),
  lines_removed: z.number().nonnegative(),
  tasks_completed: z.array(z.string()),
  blockers: z.array(z.string()),
  branch: z.string(),
  status: AgentStatusSchema,
  last_commit: z.object({
    hash: z.string(),
    message: z.string(),
    timestamp: z.string().datetime(),
  }).nullable(),
});

export type AgentMetrics = z.infer<typeof AgentMetricsSchema>;

// Team metrics aggregation
export const TeamMetricsSchema = z.object({
  total_commits: z.number().nonnegative(),
  total_files_changed: z.number().nonnegative(),
  total_lines_added: z.number().nonnegative(),
  total_lines_removed: z.number().nonnegative(),
  blockers_count: z.number().nonnegative(),
  blocked_agents: z.array(AgentNameSchema),
  average_commits_per_agent: z.number().nonnegative(),
});

export type TeamMetrics = z.infer<typeof TeamMetricsSchema>;

// Blocker report
export const BlockerReportSchema = z.object({
  description: z.string(),
  blocked_agent: AgentNameSchema,
  blocking_agent: AgentNameSchema.nullable(),
  reason: z.string(),
  estimated_resolution: z.string().datetime().nullable(),
});

export type BlockerReport = z.infer<typeof BlockerReportSchema>;

// Dependency graph
export const DependencyGraphSchema = z.object({
  from_agent: AgentNameSchema,
  to_agent: AgentNameSchema,
  relationship: RelationshipSchema,
  reason: z.string(),
  status: DependencyStatusSchema,
});

export type DependencyGraph = z.infer<typeof DependencyGraphSchema>;

// Velocity metrics
export const VelocityMetricsSchema = z.object({
  period_hours: z.number().positive(),
  team_velocity: z.object({
    commits_per_hour: z.number().nonnegative(),
    files_per_hour: z.number().nonnegative(),
    lines_per_hour: z.number().nonnegative(),
  }),
  per_agent: z.record(
    AgentNameSchema,
    z.object({
      commits_per_hour: z.number().nonnegative(),
      efficiency_ratio: z.number().nonnegative().lte(1),
    })
  ),
  trend: z.enum(["accelerating", "stable", "decelerating"]),
});

export type VelocityMetrics = z.infer<typeof VelocityMetricsSchema>;

// Conflict report
export const ConflictReportSchema = z.object({
  file: z.string(),
  modified_by: z.array(AgentNameSchema).min(2),
  severity: z.enum(["low", "medium", "high"]),
  reason: z.string(),
  owner_by_matrix: AgentNameSchema.nullable(),
  violation: z.string().optional(),
  recommendation: z.string(),
});

export type ConflictReport = z.infer<typeof ConflictReportSchema>;

// Full session metadata response
export const SessionMetadataSchema = z.object({
  session_id: z.string(),
  date: z.string().date(),
  timestamp: z.string().datetime(),
  agents: z.record(AgentNameSchema, AgentMetricsSchema),
  team_metrics: TeamMetricsSchema,
  blockers: z.array(BlockerReportSchema),
  dependencies: z.array(DependencyGraphSchema),
  critical_path: z.string(),
  velocity: z.object({
    commits_per_hour: z.number().nonnegative(),
    files_per_hour: z.number().nonnegative(),
    lines_per_hour: z.number().nonnegative(),
  }),
  last_updated: z.string().datetime(),
});

export type SessionMetadata = z.infer<typeof SessionMetadataSchema>;

// Blocker response
export const BlockerResponseSchema = z.object({
  blockers_count: z.number().nonnegative(),
  blockers: z.array(BlockerReportSchema),
  critical_blockers: z.array(AgentNameSchema),
  estimated_team_impact: z.string(),
});

export type BlockerResponse = z.infer<typeof BlockerResponseSchema>;

// Dependencies response
export const DependenciesResponseSchema = z.object({
  dependencies: z.array(DependencyGraphSchema),
  critical_path: z.string(),
  critical_path_duration_hours: z.number().positive(),
  parallel_work_possible: z.array(AgentNameSchema),
});

export type DependenciesResponse = z.infer<typeof DependenciesResponseSchema>;

// Conflicts response
export const ConflictsResponseSchema = z.object({
  conflicts: z.array(ConflictReportSchema),
  conflict_count: z.number().nonnegative(),
  ownership_violations: z.number().nonnegative(),
  merge_conflict_risk: z.enum(["low", "medium", "high"]),
});

export type ConflictsResponse = z.infer<typeof ConflictsResponseSchema>;

// Health check response
export const HealthResponseSchema = z.object({
  status: z.enum(["healthy", "degraded", "unhealthy"]),
  service: z.literal("session-closer-metadata"),
  timestamp: z.string().datetime(),
  uptime: z.number().nonnegative(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
