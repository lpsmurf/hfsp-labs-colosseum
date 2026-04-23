import { AgentNameSchema, type BlockerReport, type ConflictReport, type DependencyGraph, type AgentMetrics } from "./models.js";
import { existsSync, readFileSync } from "fs";
import pino from "pino";

const logger = pino();

type AgentName = "Claude" | "Codex" | "Gemini" | "Kimi";
type Relationship = "waiting_for" | "provides_to" | "conflicts_with";
type DependencyStatus = "active" | "resolved" | "resolved_work_around";

/**
 * Extract blockers from commit message (subject + body)
 * Looks for: BLOCKED, BLOCKED BY, BLOCKED:, ISSUE, TODO, etc.
 */
export function extractBlockers(commitMessage: string): string[] {
  const blockers: string[] = [];
  
  // Patterns to match blocker mentions
  const patterns = [
    /blocked\s*(?:by|:)\s*([^\n]+)/gi,
    /issue\s*(?:by|:)\s*([^\n]+)/gi,
    /todo\s*(?:by|:)\s*([^\n]+)/gi,
    /waiting\s*(?:for|on)\s*([^\n]+)/gi,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(commitMessage)) !== null) {
      const blocker = match[1].trim();
      if (blocker && !blockers.includes(blocker)) {
        blockers.push(blocker);
      }
    }
  }
  
  return blockers;
}

/**
 * Detect file ownership conflicts
 * Finds files modified by multiple agents (potential ownership violations)
 */
export function detectFileConflicts(agents: AgentMetrics[]): ConflictReport[] {
  const conflicts: ConflictReport[] = [];
  const fileModifications: Map<string, AgentName[]> = new Map();
  
  // Track which agents modified each file
  for (const agent of agents) {
    for (const file of agent.files_changed) {
      const current = fileModifications.get(file) || [];
      if (!current.includes(agent.name as AgentName)) {
        current.push(agent.name as AgentName);
      }
      fileModifications.set(file, current);
    }
  }
  
  // Find conflicts (files modified by >1 agent)
  for (const [file, modifiedBy] of fileModifications) {
    if (modifiedBy.length > 1) {
      // Determine severity and owner
      let severity: "low" | "medium" | "high" = "medium";
      let owner: AgentName | null = null;
      
      // Critical files → high severity
      if (file.includes("index.ts") || file.includes("docker-compose") || file.includes("package.json")) {
        severity = "high";
      }
      
      // Try to find owner from file path pattern
      // e.g., "src/handlers/" → owned by Gemini (convention)
      if (file.includes("handlers") || file.includes("message")) owner = "Gemini" as AgentName;
      if (file.includes("services") || file.includes("types")) owner = "Codex" as AgentName;
      if (file.includes("docker") || file.includes("deploy")) owner = "Claude" as AgentName;
      
      const violation = owner && !modifiedBy.includes(owner)
        ? `${modifiedBy.find(a => a !== owner)} modified ${owner}'s file`
        : `Multiple agents modified`;
      
      conflicts.push({
        file,
        modified_by: modifiedBy,
        severity,
        reason: `${modifiedBy.length} agents modified this file: ${modifiedBy.join(", ")}`,
        owner_by_matrix: owner,
        violation,
        recommendation: "Coordinate via PR review or merge conflict resolution",
      });
    }
  }
  
  return conflicts;
}

/**
 * Extract dependencies from .claude/context.md
 * Parses agent status, blockers, and cross-agent dependencies
 */
export function extractDependencies(contextPath: string): DependencyGraph[] {
  const dependencies: DependencyGraph[] = [];
  
  if (!existsSync(contextPath)) {
    logger.debug(`Context file not found: ${contextPath}`);
    return dependencies;
  }
  
  try {
    const content = readFileSync(contextPath, "utf-8");
    
    // Parse "Cross-Agent Blockers" section
    const blockerSection = content.match(/## Cross-Agent(?:\s+Blockers|Dependencies)[\s\S]*?(?=##|$)/i);
    if (blockerSection) {
      // Look for patterns like "Agent A blocked by Agent B" or "Agent A waiting for Agent B"
      const blockPatterns = [
        /(\w+)\s+(?:blocked by|waiting for)\s+(\w+)\s*(?:-|:)\s*([^\n]+)/gi,
        /(\w+)\s+→\s+(\w+)\s*(?:-|:)\s*([^\n]+)/gi,
      ];
      
      for (const pattern of blockPatterns) {
        let match;
        while ((match = pattern.exec(blockerSection[0])) !== null) {
          const fromAgent = match[1].trim() as AgentName;
          const toAgent = match[2].trim() as AgentName;
          const reason = match[3]?.trim() || "Dependency";
          
          // Validate agent names
          if (isValidAgentName(fromAgent) && isValidAgentName(toAgent)) {
            dependencies.push({
              from_agent: fromAgent,
              to_agent: toAgent,
              relationship: "waiting_for",
              reason,
              status: "active",
            });
          }
        }
      }
    }
    
    // Parse agent-specific blockers
    const agentBlocks = content.matchAll(/### (\w+) Status[\s\S]*?Blockers?[:\s]*([^\n]+)/gi);
    for (const match of agentBlocks) {
      const agent = match[1].trim() as AgentName;
      const blockerText = match[2]?.trim();
      
      if (blockerText && blockerText.toLowerCase() !== "none" && isValidAgentName(agent)) {
        // Try to extract which agent is blocking
        const blockingMatch = blockerText.match(/(\w+)/);
        if (blockingMatch) {
          const blockingAgent = blockingMatch[1] as AgentName;
          if (isValidAgentName(blockingAgent) && blockingAgent !== agent) {
            dependencies.push({
              from_agent: agent,
              to_agent: blockingAgent,
              relationship: "waiting_for",
              reason: blockerText,
              status: "active",
            });
          }
        }
      }
    }
  } catch (error) {
    logger.error({ error, contextPath }, "Error parsing context file");
  }
  
  return dependencies;
}

/**
 * Calculate team velocity (commits/files/lines per hour)
 */
export function calculateVelocity(agents: AgentMetrics[], hoursBack: number): {
  commits_per_hour: number;
  files_per_hour: number;
  lines_per_hour: number;
  per_agent: Record<string, { commits_per_hour: number; efficiency_ratio: number }>;
  trend: "accelerating" | "stable" | "decelerating";
} {
  const totalCommits = agents.reduce((sum, a) => sum + a.commits, 0);
  const totalFiles = agents.reduce((sum, a) => sum + a.files_count, 0);
  const totalLines = agents.reduce((sum, a) => sum + a.lines_added, 0);
  
  const commitsPerHour = hoursBack > 0 ? totalCommits / hoursBack : 0;
  const filesPerHour = hoursBack > 0 ? totalFiles / hoursBack : 0;
  const linesPerHour = hoursBack > 0 ? totalLines / hoursBack : 0;
  
  // Per-agent efficiency
  const perAgent: Record<string, { commits_per_hour: number; efficiency_ratio: number }> = {};
  for (const agent of agents) {
    const agentCommitsPerHour = hoursBack > 0 ? agent.commits / hoursBack : 0;
    const efficiencyRatio = totalCommits > 0 ? agent.commits / totalCommits : 0;
    perAgent[agent.name] = {
      commits_per_hour: agentCommitsPerHour,
      efficiency_ratio: Math.min(1, efficiencyRatio),
    };
  }
  
  // Determine trend (simplified: assume accelerating if velocity > 1 commit/hour)
  const trend: "accelerating" | "stable" | "decelerating" =
    commitsPerHour > 1 ? "accelerating" : commitsPerHour > 0.5 ? "stable" : "decelerating";
  
  return {
    commits_per_hour: commitsPerHour,
    files_per_hour: filesPerHour,
    lines_per_hour: linesPerHour,
    per_agent: perAgent,
    trend,
  };
}

/**
 * Validate if string is a valid agent name
 */
function isValidAgentName(name: string): name is AgentName {
  const validNames = ["Claude", "Codex", "Gemini", "Kimi"];
  return validNames.includes(name);
}

/**
 * Calculate critical path (longest dependency chain)
 */
export function calculateCriticalPath(dependencies: DependencyGraph[]): string {
  if (dependencies.length === 0) {
    return "All agents independent";
  }
  
  // Simple heuristic: find longest chain of dependencies
  // In reality, this would require topological sorting
  const fromAgents = [...new Set(dependencies.map(d => d.from_agent))];
  const toAgents = [...new Set(dependencies.map(d => d.to_agent))];
  
  // Agents with no incoming dependencies (can start immediately)
  const independent = fromAgents.filter(a => !toAgents.includes(a));
  
  // Build a simple chain representation
  if (independent.length === 0) {
    return "Circular dependency detected";
  }
  
  // Return a reasonable critical path
  const sources = toAgents.filter(a => !fromAgents.includes(a));
  if (sources.length === 0) {
    return toAgents.slice(0, 3).join(" → ");
  }
  
  return sources.concat(independent.slice(0, 2)).join(" → ");
}
