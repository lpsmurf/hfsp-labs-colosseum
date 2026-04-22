import * as fs from "fs";
import * as path from "path";
import * as child_process from "child_process";

/**
 * Dev Session Closer — Multi-Agent Edition
 * Summarizes work from all 4 agents (Claude, Codex, Gemini, Kimi)
 *
 * Usage:
 *   npx ts-node session-closer.ts [--commit] [--agents-only]
 */

interface SessionData {
  date: string;
  sessionId: string;
  title: string;
  startTime: string;
  endTime: string;
  accomplishments: string[];
  decisions: Map<string, string>;
  filesChanged: Map<string, string>;
  commits: string[];
  nextSteps: string[];
  blockers: string[];
}

interface AgentMetrics {
  name: string;
  prefix: string;
  commits: string[];
  commitCount: number;
  filesChanged: Set<string>;
  filesCount: number;
  linesAdded: number;
  linesRemoved: number;
  tasksCompleted: string[];
  blockers: string[];
  branch: string;
  status: string;
}

interface AgentContextInfo {
  name: string;
  task: string;
  status: string;
  deadline: string;
  dependencies: string;
  branch: string;
}

/**
 * Get git commit log since N hours ago
 */
function getCommitLog(hoursBack: number = 8): string[] {
  try {
    const since = `${hoursBack} hours ago`;
    const output = child_process.execSync(
      `git log --oneline --since="${since}" -- .`,
      { encoding: "utf-8", cwd: process.cwd() }
    );
    return output.split("\n").filter((line) => line.trim());
  } catch {
    return ["[No commits found]"];
  }
}

/**
 * Get files changed in recent commits
 */
function getChangedFiles(): Map<string, string> {
  try {
    const output = child_process.execSync(
      `git diff --name-status HEAD~20..HEAD 2>/dev/null || echo "No history"`,
      { encoding: "utf-8", cwd: process.cwd() }
    );

    const files = new Map<string, string>();
    output.split("\n").forEach((line) => {
      const [status, filepath] = line.split("\t");
      if (filepath) {
        const statusMap: { [key: string]: string } = {
          A: "Added",
          M: "Modified",
          D: "Deleted",
        };
        files.set(filepath, statusMap[status] || status);
      }
    });
    return files;
  } catch {
    return new Map();
  }
}

/**
 * Read build context for milestones
 */
function getBuildContext(): {
  milestones: string[];
  status: string;
} {
  try {
    const buildContextPath = path.join(
      process.env.HOME || "",
      ".superstack/build-context.md"
    );
    const content = fs.readFileSync(buildContextPath, "utf-8");

    const milestonesMatch = content.match(
      /## build_status\n([\s\S]*?)(?=##|$)/
    );
    const milestones = milestonesMatch
      ? milestonesMatch[1].split("\n").filter((l) => l.trim())
      : [];

    return { milestones, status: "See ~/.superstack/build-context.md" };
  } catch {
    return { milestones: ["[No build context found]"], status: "N/A" };
  }
}

/**
 * Parse agent prefix from commit message
 */
function parseAgentFromCommit(message: string): string | null {
  const match = message.match(/^\[(CLAUDE|OPENAI|GEMINI|KIMI)\]/);
  return match ? match[1] : null;
}

/**
 * Map agent prefix to display name
 */
function agentDisplayName(prefix: string): string {
  const names: { [key: string]: string } = {
    CLAUDE: "Claude",
    OPENAI: "Codex",
    GEMINI: "Gemini",
    KIMI: "Kimi",
  };
  return names[prefix] || prefix;
}

/**
 * Extract metrics for a specific agent
 */
function extractAgentMetrics(agent: string, hoursBack: number = 8): AgentMetrics {
  try {
    const grepPattern = `^\\[${agent}\\]`;
    
    // Get commits for this agent
    const commitsOutput = child_process.execSync(
      `git log --oneline --all --since="${hoursBack} hours ago" --grep="${grepPattern}" 2>/dev/null || echo ""`,
      { encoding: "utf-8", cwd: process.cwd() }
    );
    
    const commits = commitsOutput.split("\n").filter((line) => line.trim());
    const commitCount = commits.length;

    // Get files changed for this agent
    let filesChanged = new Set<string>();
    try {
      const filesOutput = child_process.execSync(
        `git log --all --since="${hoursBack} hours ago" --grep="${grepPattern}" --name-status --pretty=format: 2>/dev/null || echo ""`,
        { encoding: "utf-8", cwd: process.cwd() }
      );
      
      filesOutput.split("\n").forEach((line) => {
        const parts = line.split("\t");
        if (parts.length >= 2) {
          filesChanged.add(parts[1]);
        }
      });
    } catch {
      // If file parsing fails, continue with empty set
    }

    // Get lines added/removed for this agent
    let linesAdded = 0;
    let linesRemoved = 0;
    try {
      const statsOutput = child_process.execSync(
        `git log --all --since="${hoursBack} hours ago" --grep="${grepPattern}" --stat --pretty=format: 2>/dev/null || echo ""`,
        { encoding: "utf-8", cwd: process.cwd() }
      );
      
      // Parse stat lines like " file.ts | 10 +++++++++++"
      statsOutput.split("\n").forEach((line) => {
        const match = line.match(/(\d+)\s*\+/g);
        const removals = line.match(/(\d+)\s*-/g);
        
        if (match) {
          match.forEach((m) => {
            const num = parseInt(m);
            if (!isNaN(num)) linesAdded += num;
          });
        }
        if (removals) {
          removals.forEach((m) => {
            const num = parseInt(m);
            if (!isNaN(num)) linesRemoved += num;
          });
        }
      });
    } catch {
      // If stats parsing fails, continue with zeros
    }

    // Extract tasks and blockers from commit messages
    const tasksCompleted: string[] = [];
    const blockers: string[] = [];

    commits.forEach((commit) => {
      const match = commit.match(/^[a-f0-9]+ (.+)$/);
      if (match) {
        const msg = match[1].replace(grepPattern, "").trim();
        if (msg) tasksCompleted.push(msg);
        
        if (msg.includes("BLOCKED") || msg.includes("BLOCKED BY")) {
          blockers.push(msg);
        }
      }
    });

    // Find active branch for this agent
    let branch = `feature/${agent.toLowerCase()}/unknown`;
    try {
      const branchOutput = child_process.execSync(
        `git branch -a --list "feature/${agent.toLowerCase()}/*" 2>/dev/null | head -1 || echo ""`,
        { encoding: "utf-8", cwd: process.cwd() }
      );
      if (branchOutput.trim()) {
        branch = branchOutput.trim().replace("* ", "").replace("remotes/origin/", "");
      }
    } catch {
      // Use default if branch detection fails
    }

    return {
      name: agentDisplayName(agent),
      prefix: `[${agent}]`,
      commits,
      commitCount,
      filesChanged,
      filesCount: filesChanged.size,
      linesAdded,
      linesRemoved,
      tasksCompleted: tasksCompleted.slice(0, 5), // First 5
      blockers,
      branch,
      status: blockers.length > 0 ? "Blocked" : commitCount > 0 ? "Complete" : "No commits",
    };
  } catch (error) {
    console.warn(`⚠️  Error extracting metrics for ${agent}:`, error);
    return {
      name: agentDisplayName(agent),
      prefix: `[${agent}]`,
      commits: [],
      commitCount: 0,
      filesChanged: new Set(),
      filesCount: 0,
      linesAdded: 0,
      linesRemoved: 0,
      tasksCompleted: [],
      blockers: [],
      branch: `feature/${agent.toLowerCase()}/unknown`,
      status: "Error",
    };
  }
}

/**
 * Extract all 4 agents' metrics
 */
function extractAllAgents(hoursBack: number = 8): AgentMetrics[] {
  const agents = ["CLAUDE", "OPENAI", "GEMINI", "KIMI"];
  return agents.map((agent) => extractAgentMetrics(agent, hoursBack));
}

/**
 * Read agent context from .claude/context.md
 */
function readAgentContext(): Map<string, AgentContextInfo> {
  const contextMap = new Map<string, AgentContextInfo>();
  
  try {
    const contextPath = path.join(process.cwd(), ".claude", "context.md");
    if (!fs.existsSync(contextPath)) {
      return contextMap;
    }

    const content = fs.readFileSync(contextPath, "utf-8");
    const agents = [
      { name: "Claude", prefix: "CLAUDE" },
      { name: "Codex", prefix: "OPENAI" },
      { name: "Gemini", prefix: "GEMINI" },
      { name: "Kimi", prefix: "KIMI" },
    ];

    agents.forEach(({ name, prefix }) => {
      const agentSection = content.match(
        new RegExp(`### ${name}[\\s\\S]*?(?=###|$)`)
      );
      if (agentSection) {
        const section = agentSection[0];
        const taskMatch = section.match(/- \*\*Task\*\*: (.+)/);
        const statusMatch = section.match(/- \*\*Status\*\*: (.+)/);
        const deadlineMatch = section.match(/- \*\*Deadline\*\*: (.+)/);
        const depMatch = section.match(/- \*\*Dependencies\*\*: (.+)/);
        const branchMatch = section.match(/- \*\*Branch\*\*: (.+)/);

        contextMap.set(prefix, {
          name,
          task: taskMatch ? taskMatch[1].trim() : "[No task set]",
          status: statusMatch ? statusMatch[1].trim() : "Not Set",
          deadline: deadlineMatch ? deadlineMatch[1].trim() : "None",
          dependencies: depMatch ? depMatch[1].trim() : "None",
          branch: branchMatch ? branchMatch[1].trim() : "unknown",
        });
      }
    });
  } catch (error) {
    console.warn("⚠️  Could not read agent context:", error);
  }

  return contextMap;
}

/**
 * Generate metrics table
 */
function generateMetricsTable(agents: AgentMetrics[]): string {
  let total = {
    commits: 0,
    files: 0,
    added: 0,
    removed: 0,
  };

  agents.forEach((agent) => {
    total.commits += agent.commitCount;
    total.files += agent.filesCount;
    total.added += agent.linesAdded;
    total.removed += agent.linesRemoved;
  });

  const rows = agents
    .map(
      (agent) =>
        `| ${agent.name} | ${agent.commitCount} | ${agent.filesCount} | +${agent.linesAdded} | -${agent.linesRemoved} | ${agent.status} |`
    )
    .join("\n");

  return `| Agent | Commits | Files Changed | Lines Added | Lines Removed | Status |
|-------|---------|---------------|-------------|---------------|--------|
${rows}
| **TOTAL** | **${total.commits}** | **${total.files}** | **+${total.added}** | **-${total.removed}** | **On Track** |`;
}

/**
 * Generate per-agent report sections
 */
function generatePerAgentReports(
  agents: AgentMetrics[],
  contextMap: Map<string, AgentContextInfo>
): string {
  return agents
    .map((agent) => {
      const context = contextMap.get(agent.prefix.slice(1, -1)); // Remove brackets
      const tasksStr = agent.tasksCompleted
        .map((t) => `- [x] ${t}`)
        .join("\n");
      const blockersStr =
        agent.blockers.length > 0
          ? agent.blockers.map((b) => `- ${b}`).join("\n")
          : "None";

      const commitsStr = agent.commits
        .slice(0, 5)
        .map((c) => `  ${c}`)
        .join("\n");

      return `### ${agent.name} — ${agent.branch}
**Commits**: ${agent.commitCount} ${agent.prefix}  
**Files Changed**: ${agent.filesCount}  
**Status**: ${agent.status}

#### Work Completed
${tasksStr || "- [x] [No tasks extracted from commits]"}

#### Metrics
- Lines Added: +${agent.linesAdded}
- Lines Removed: -${agent.linesRemoved}
- Files Modified: ${agent.filesCount}

#### Blockers
${blockersStr}

#### Latest Commits
\`\`\`
${commitsStr || "[No commits this session]"}
\`\`\`

---`;
    })
    .join("\n");
}

/**
 * Generate markdown summary (original single-author version, deprecated)
 */
function generateSummary(session: SessionData): string {
  const filesList = Array.from(session.filesChanged.entries())
    .map(([file, status]) => `- **${status}**: \`${file}\``)
    .join("\n");

  const commitsList = session.commits
    .map((commit) => `  ${commit}`)
    .join("\n");

  const decisionsList = Array.from(session.decisions.entries())
    .map(([category, choice]) => `- **${category}**: ${choice}`)
    .join("\n");

  const accomplishmentsList = session.accomplishments
    .map((a) => `- ${a}`)
    .join("\n");

  const nextStepsList = session.nextSteps
    .map((step, i) => `${i + 1}. ${step}`)
    .join("\n");

  const blockersList =
    session.blockers.length > 0
      ? session.blockers.map((b) => `- [ ] ${b}`).join("\n")
      : "None";

  const { milestones } = getBuildContext();

  return `# Dev Session Summary: ${session.date}

**Session ID**: \`${session.sessionId}\`  
**Date**: \`${session.date}\`  
**Duration**: ${session.startTime} — ${session.endTime}  
**Focus**: ${session.title}

---

## 🎯 Accomplishments

${accomplishmentsList}

---

## 🔧 Key Decisions Made

${decisionsList || "None documented this session"}

---

## 📊 Build Status

${milestones.map((m) => `- ${m}`).join("\n")}

---

## 📋 Next Steps (Prioritized)

${nextStepsList}

---

## ⚠️ Blockers

${blockersList}

---

## 💾 Files Changed

${filesList || "No files changed"}

---

## 📝 Commits

\`\`\`
${commitsList}
\`\`\`

---

## 🔗 References

- Build context: \`~/.superstack/build-context.md\`
- Architecture: \`docs/architecture/AGENT_UX_ARCHITECTURE.md\`
- Agent brain: \`packages/agent-provisioning/services/agent-brain/\`

---

**Session closed**: ${new Date().toISOString()}  
**Next session ready**: Check accomplishments and next steps above.
`;
}

/**
 * Generate multi-agent session summary (NEW)
 */
function generateMultiAgentSummary(agents: AgentMetrics[]): string {
  const contextMap = readAgentContext();
  const metricsTable = generateMetricsTable(agents);
  const agentReports = generatePerAgentReports(agents, contextMap);
  const { milestones } = getBuildContext();

  const totalCommits = agents.reduce((sum, a) => sum + a.commitCount, 0);

  return `# Multi-Agent Session Summary: ${new Date().toISOString().split("T")[0]}

**Session Type**: Multi-Agent Report  
**Agents**: Claude, Codex, Gemini, Kimi  
**Total Commits**: ${totalCommits}

---

## 📊 Daily Metrics (All Agents)

${metricsTable}

---

## 🤖 Agent Reports

${agentReports}

---

## 📊 Build Status

${milestones.map((m) => `- ${m}`).join("\n")}

---

## 🔗 References

- Multi-Agent Template: \`SESSIONS/MULTI-AGENT-SESSION-TEMPLATE.md\`
- Agent Context: \`.claude/context.md\`
- Build Context: \`~/.superstack/build-context.md\`

---

**Session Summary Generated**: ${new Date().toISOString()}  
**Auto-Generated by**: session-closer (multi-agent mode)
`;
}

/**
 * Main: Generate and optionally commit summary
 */
async function main() {
  const args = process.argv.slice(2);
  const shouldCommit = args.includes("--commit");
  const agentsOnly = args.includes("--agents-only");

  const now = new Date();
  const date = now.toISOString().split("T")[0];
  const sessionId = `session-${date}-${Math.random().toString(36).slice(2, 8)}`;

  if (agentsOnly) {
    // Multi-agent mode only
    console.log("🤖 Extracting metrics from all 4 agents...\n");
    const agents = extractAllAgents(8);

    agents.forEach((agent) => {
      console.log(
        `  ${agent.name}: ${agent.commitCount} commits, ${agent.filesCount} files, +${agent.linesAdded}/-${agent.linesRemoved} lines, Status: ${agent.status}`
      );
    });

    console.log("");
    const markdown = generateMultiAgentSummary(agents);

    // Write to SESSIONS/
    const repoRoot = process.cwd();
    const sessionsDir = path.join(repoRoot, "SESSIONS");
    const summaryFile = path.join(sessionsDir, `${date}-multi-agent-session.md`);

    if (!fs.existsSync(sessionsDir)) {
      fs.mkdirSync(sessionsDir, { recursive: true });
    }

    fs.writeFileSync(summaryFile, markdown);
    console.log(`✅ Multi-agent session summary written to: ${summaryFile}`);

    // Optionally commit
    if (shouldCommit) {
      try {
        child_process.execSync(`git add "${summaryFile}"`, {
          cwd: repoRoot,
          stdio: "inherit",
        });

        const commitMsg = `[SESSIONS] Multi-agent summary — ${date}

Claude + Codex + Gemini + Kimi work report
Session ID: ${sessionId}

See SESSIONS/${date}-multi-agent-session.md for full summary.`;

        child_process.execSync(`git commit -m "${commitMsg}"`, {
          cwd: repoRoot,
          stdio: "inherit",
        });

        console.log("✅ Multi-agent summary committed to git.");
      } catch (error) {
        console.warn(
          "⚠️  Git commit failed. Summary still saved to SESSIONS/."
        );
      }
    }

    console.log("\n📝 Summary preview:\n");
    console.log(markdown.split("\n").slice(0, 40).join("\n"));
    console.log("\n...[full summary in SESSIONS/]");
    return;
  }

  // Original single-author mode
  const session: SessionData = {
    date,
    sessionId,
    title: "Daily Dev Session",
    startTime: "08:00 AM",
    endTime: now.toLocaleTimeString(),
    accomplishments: [
      "✅ Completed Milestone 1: Self-Manifest + Mastra foundation",
      "✅ Created agent-brain service with 5 HTTP endpoints",
      "✅ Established session tracking infrastructure (SESSIONS/ folder)",
      "✅ Created repository cleanup plan (docs/, scripts/)",
      "✅ Built session-closer automation tools",
    ],
    decisions: new Map([
      [
        "Node.js Versioning",
        "agent-brain runs in Docker with Node 22+, agent-provisioning stays on Node 18",
      ],
      [
        "Build Order",
        "DAO bundle first (no paid APIs), trading second, travel third",
      ],
      [
        "Session Tracking",
        "Daily summaries auto-committed to SESSIONS/ folder",
      ],
    ]),
    filesChanged: getChangedFiles(),
    commits: getCommitLog(8),
    nextSteps: [
      "Milestone 2: Wire hfsp_minibot → agent-brain /message endpoint",
      "Implement DAO bundle (Realms, Squads, Meteora SDKs)",
      "Implement trading bundle (Jupiter MCP, DefiLlama, CoinGecko)",
      "Run repo cleanup script to move planning docs to docs/",
      "Test agent-brain locally (npm install, npm run dev on Node 22)",
    ],
    blockers: [
      "Node.js 18 in monorepo conflicts with Mastra (requires 22+). Solution: Docker container.",
      "Telegram bridge not yet wired. Blocked on agent-brain local test.",
    ],
  };

  const markdown = generateSummary(session);

  const repoRoot = process.cwd();
  const sessionsDir = path.join(repoRoot, "SESSIONS");
  const summaryFile = path.join(sessionsDir, `${date}-dev-session.md`);

  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }

  fs.writeFileSync(summaryFile, markdown);
  console.log(`✅ Session summary written to: ${summaryFile}`);

  if (shouldCommit) {
    try {
      child_process.execSync(`git add "${summaryFile}"`, {
        cwd: repoRoot,
        stdio: "inherit",
      });

      const commitMsg = `[SESSIONS] ${date} - Daily Dev Session

Session ID: ${session.sessionId}

See SESSIONS/${date}-dev-session.md for full summary.`;

      child_process.execSync(`git commit -m "${commitMsg}"`, {
        cwd: repoRoot,
        stdio: "inherit",
      });

      console.log("✅ Session summary committed to git.");
    } catch (error) {
      console.warn(
        "⚠️  Git commit failed. Summary still saved to SESSIONS/."
      );
    }
  }

  console.log("\n📝 Summary preview:\n");
  console.log(markdown.split("\n").slice(0, 30).join("\n"));
  console.log("\n...[full summary in SESSIONS/]\n");
  console.log("💡 Tip: Use --agents-only to generate multi-agent report");
}

main().catch(console.error);
