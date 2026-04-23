import express, { Request, Response } from "express";
import pino from "pino";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import {
  SessionMetadataSchema,
  BlockerResponseSchema,
  DependenciesResponseSchema,
  VelocityMetricsSchema,
  ConflictsResponseSchema,
  HealthResponseSchema,
  type SessionMetadata,
  type BlockerResponse,
  type DependenciesResponse,
  type ConflictsResponse,
  type HealthResponse,
  type VelocityMetrics,
} from "./models.js";
import {
  extractBlockers,
  detectFileConflicts,
  extractDependencies,
  calculateVelocity,
  calculateCriticalPath,
} from "./extractors.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = pino();
const app = express();
const PORT = parseInt(process.env.METADATA_PORT || "3335", 10);
const startTime = Date.now();

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  logger.debug(`${req.method} ${req.path}`);
  next();
});

// Type definitions
interface AgentData {
  name: "Claude" | "Codex" | "Gemini" | "Kimi";
  prefix: string;
  commits: number;
  files_changed: string[];
  files_count: number;
  lines_added: number;
  lines_removed: number;
  tasks_completed: string[];
  blockers: string[];
  branch: string;
  status: "in_progress" | "complete" | "blocked" | "no_commits";
  last_commit: { hash: string; message: string; timestamp: string } | null;
}

/**
 * GET /health
 * Service health check
 */
app.get("/health", (req: Request, res: Response) => {
  const uptime = (Date.now() - startTime) / 1000;
  const response: HealthResponse = {
    status: "healthy",
    service: "session-closer-metadata",
    timestamp: new Date().toISOString(),
    uptime,
  };
  
  try {
    HealthResponseSchema.parse(response);
    res.status(200).json(response);
  } catch (error) {
    logger.error({ error }, "Health response validation failed");
    res.status(500).json({ error: "Health check failed" });
  }
});

/**
 * GET /api/v1/session-status
 * Full session metadata with all agents and metrics
 */
app.get("/api/v1/session-status", (req: Request, res: Response) => {
  try {
    const hoursBack = parseInt((req.query.hours_back as string) || "8", 10);
    const singleAgent = req.query.agent as string | undefined;
    
    // Extract agent metrics from git
    const agents = extractAgentsFromGit(hoursBack);
    
    // Filter if single agent requested
    const filteredAgents = singleAgent
      ? agents.filter(a => a.name.toLowerCase() === singleAgent.toLowerCase())
      : agents;
    
    if (filteredAgents.length === 0) {
      return res.status(404).json({ error: "No agent data found" });
    }
    
    // Extract blockers and dependencies
    const allBlockers = agents.flatMap(agent => 
      extractBlockers(agent.tasks_completed.join("\n")).map(blocker => ({
        description: blocker,
        blocked_agent: agent.name as any,
        blocking_agent: null,
        reason: "Mentioned in commits",
        estimated_resolution: null,
      }))
    );
    
    const contextPath = path.join(__dirname, "../../.claude/context.md");
    const dependencies = extractDependencies(contextPath);
    
    // Calculate metrics
    const teamMetrics = {
      total_commits: agents.reduce((s, a) => s + a.commits, 0),
      total_files_changed: agents.reduce((s, a) => s + a.files_count, 0),
      total_lines_added: agents.reduce((s, a) => s + a.lines_added, 0),
      total_lines_removed: agents.reduce((s, a) => s + a.lines_removed, 0),
      blockers_count: allBlockers.length,
      blocked_agents: allBlockers.map(b => b.blocked_agent),
      average_commits_per_agent: agents.length > 0 
        ? agents.reduce((s, a) => s + a.commits, 0) / agents.length
        : 0,
    };
    
    const velocity = calculateVelocity(agents as any, hoursBack);
    const criticalPath = calculateCriticalPath(dependencies);
    
    const response: SessionMetadata = {
      session_id: `session-${new Date().toISOString().split("T")[0]}`,
      date: new Date().toISOString().split("T")[0],
      timestamp: new Date().toISOString(),
      agents: Object.fromEntries(
        agents.map(a => [a.name, a])
      ),
      team_metrics: teamMetrics,
      blockers: allBlockers.slice(0, 10),
      dependencies,
      critical_path: criticalPath,
      velocity: {
        commits_per_hour: velocity.commits_per_hour,
        files_per_hour: velocity.files_per_hour,
        lines_per_hour: velocity.lines_per_hour,
      },
      last_updated: new Date().toISOString(),
    };
    
    // Validate response
    SessionMetadataSchema.parse(response);
    res.status(200).json(response);
  } catch (error) {
    logger.error({ error }, "Error fetching session status");
    res.status(500).json({ error: "Failed to fetch session status" });
  }
});

/**
 * GET /api/v1/session-status/blockers
 * Only blockers and what's blocking progress
 */
app.get("/api/v1/session-status/blockers", (req: Request, res: Response) => {
  try {
    const hoursBack = parseInt((req.query.hours_back as string) || "8", 10);
    const agents = extractAgentsFromGit(hoursBack);
    
    const allBlockers = agents.flatMap(agent =>
      extractBlockers(agent.tasks_completed.join("\n")).map(blocker => ({
        description: blocker,
        blocked_agent: agent.name as any,
        blocking_agent: null,
        reason: "Mentioned in commits",
        estimated_resolution: null,
      }))
    );
    
    const response: BlockerResponse = {
      blockers_count: allBlockers.length,
      blockers: allBlockers,
      critical_blockers: agents
        .filter(a => a.status === "blocked")
        .map(a => a.name as any),
      estimated_team_impact: allBlockers.length > 0 ? "High - blocking progress" : "None",
    };
    
    BlockerResponseSchema.parse(response);
    res.status(200).json(response);
  } catch (error) {
    logger.error({ error }, "Error fetching blockers");
    res.status(500).json({ error: "Failed to fetch blockers" });
  }
});

/**
 * GET /api/v1/session-status/dependencies
 * Agent dependency graph
 */
app.get("/api/v1/session-status/dependencies", (req: Request, res: Response) => {
  try {
    const contextPath = path.join(__dirname, "../../.claude/context.md");
    const dependencies = extractDependencies(contextPath);
    const criticalPath = calculateCriticalPath(dependencies);
    
    const response: DependenciesResponse = {
      dependencies,
      critical_path: criticalPath,
      critical_path_duration_hours: 48,
      parallel_work_possible: ["Claude", "Kimi"].filter(a =>
        !dependencies.some(d => d.from_agent === a)
      ) as any,
    };
    
    DependenciesResponseSchema.parse(response);
    res.status(200).json(response);
  } catch (error) {
    logger.error({ error }, "Error fetching dependencies");
    res.status(500).json({ error: "Failed to fetch dependencies" });
  }
});

/**
 * GET /api/v1/session-status/velocity
 * Team velocity metrics
 */
app.get("/api/v1/session-status/velocity", (req: Request, res: Response) => {
  try {
    const hoursBack = parseInt((req.query.hours_back as string) || "8", 10);
    const agents = extractAgentsFromGit(hoursBack);
    const velocity = calculateVelocity(agents as any, hoursBack);
    
    const response: VelocityMetrics = {
      period_hours: hoursBack,
      team_velocity: {
        commits_per_hour: velocity.commits_per_hour,
        files_per_hour: velocity.files_per_hour,
        lines_per_hour: velocity.lines_per_hour,
      },
      per_agent: velocity.per_agent,
      trend: velocity.trend,
    };
    
    VelocityMetricsSchema.parse(response);
    res.status(200).json(response);
  } catch (error) {
    logger.error({ error }, "Error calculating velocity");
    res.status(500).json({ error: "Failed to calculate velocity" });
  }
});

/**
 * GET /api/v1/session-status/conflicts
 * File ownership conflicts (auto-detected)
 */
app.get("/api/v1/session-status/conflicts", (req: Request, res: Response) => {
  try {
    const hoursBack = parseInt((req.query.hours_back as string) || "8", 10);
    const agents = extractAgentsFromGit(hoursBack);
    const conflicts = detectFileConflicts(agents as any);
    
    const response: ConflictsResponse = {
      conflicts,
      conflict_count: conflicts.length,
      ownership_violations: conflicts.filter(c => c.violation).length,
      merge_conflict_risk: conflicts.length > 3 ? "high" : conflicts.length > 0 ? "medium" : "low",
    };
    
    ConflictsResponseSchema.parse(response);
    res.status(200).json(response);
  } catch (error) {
    logger.error({ error }, "Error detecting conflicts");
    res.status(500).json({ error: "Failed to detect conflicts" });
  }
});

/**
 * Extract agent metrics from git history
 */
function extractAgentsFromGit(hoursBack: number): AgentData[] {
  const agents: AgentData[] = [];
  const agentPrefixes = [
    { name: "Claude" as const, prefix: "[CLAUDE]" },
    { name: "Codex" as const, prefix: "[OPENAI]" },
    { name: "Gemini" as const, prefix: "[GEMINI]" },
    { name: "Kimi" as const, prefix: "[KIMI]" },
  ];
  
  for (const { name, prefix } of agentPrefixes) {
    try {
      const since = `${hoursBack} hours ago`;
      
      // Get commits
      const commitLog = execSync(
        `git log --oneline --all --grep="^\\${prefix}" --since="${since}"`,
        { encoding: "utf-8" }
      ).trim();
      
      const commits = commitLog.split("\n").filter(l => l.length > 0);
      const commitCount = commits.length;
      
      // Get files changed
      let filesChanged: string[] = [];
      if (commitCount > 0) {
        const filesOutput = execSync(
          `git log --name-only --pretty=format: --all --grep="^\\${prefix}" --since="${since}"`,
          { encoding: "utf-8" }
        );
        filesChanged = [...new Set(filesOutput.split("\n").filter(f => f.length > 0))];
      }
      
      // Get lines changed
      let linesAdded = 0;
      let linesRemoved = 0;
      if (commitCount > 0) {
        try {
          const statsOutput = execSync(
            `git log --stat --pretty=format: --all --grep="^\\${prefix}" --since="${since}"`,
            { encoding: "utf-8" }
          );
          
          const addedMatches = statsOutput.match(/(\d+)\s+\+/g) || [];
          const removedMatches = statsOutput.match(/(\d+)\s+-/g) || [];
          
          linesAdded = addedMatches.reduce((sum, m) => sum + parseInt(m), 0);
          linesRemoved = removedMatches.reduce((sum, m) => sum + parseInt(m), 0);
        } catch (e) {
          logger.debug(`Could not parse stats for ${name}`);
        }
      }
      
      // Extract tasks and blockers
      const tasksCompleted = commits.map(c => c.replace(`${prefix}`, "").trim());
      const blockers = tasksCompleted
        .flatMap(t => extractBlockers(t))
        .filter((b, i, a) => a.indexOf(b) === i);
      
      // Determine status
      let status: "in_progress" | "complete" | "blocked" | "no_commits" = "complete";
      if (commitCount === 0) status = "no_commits";
      else if (blockers.length > 0) status = "blocked";
      else if (commitCount > 0) status = "in_progress";
      
      // Get branch
      let branch = `feature/${name.toLowerCase()}/work`;
      try {
        const branchOutput = execSync(
          `git branch -a --list "feature/${name.toLowerCase()}/*" | head -1`,
          { encoding: "utf-8" }
        ).trim();
        if (branchOutput) branch = branchOutput.replace(/^\*?\s*/, "");
      } catch (e) {
        logger.debug(`Could not find branch for ${name}`);
      }
      
      // Get last commit
      let lastCommit = null;
      if (commits.length > 0) {
        try {
          const lastCommitDetails = execSync(
            `git log -1 --pretty=format:"%H|%s|%aI" --grep="^\\${prefix}" --all --since="${since}"`,
            { encoding: "utf-8" }
          ).trim();
          const [hash, message, timestamp] = lastCommitDetails.split("|");
          lastCommit = { hash, message, timestamp };
        } catch (e) {
          logger.debug(`Could not get last commit for ${name}`);
        }
      }
      
      agents.push({
        name,
        prefix,
        commits: commitCount,
        files_changed: filesChanged,
        files_count: filesChanged.length,
        lines_added: linesAdded,
        lines_removed: linesRemoved,
        tasks_completed: tasksCompleted,
        blockers,
        branch,
        status,
        last_commit: lastCommit,
      });
    } catch (error) {
      logger.debug({ error }, `Error extracting metrics for ${name}`);
      agents.push({
        name,
        prefix,
        commits: 0,
        files_changed: [],
        files_count: 0,
        lines_added: 0,
        lines_removed: 0,
        tasks_completed: [],
        blockers: [],
        branch: `feature/${name.toLowerCase()}/work`,
        status: "no_commits",
        last_commit: null,
      });
    }
  }
  
  return agents;
}

// Start server
const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, "Session-closer metadata service listening");
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully");
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
});

export default app;
