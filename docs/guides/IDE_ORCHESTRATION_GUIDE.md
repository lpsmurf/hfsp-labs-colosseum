# IDE & Orchestration Tools Guide

**Updated**: April 22, 2026

---

## 🎯 Recommended IDE Setup

### **Primary Recommendation: VS Code + Workspace**

**Why VS Code?**
- ✅ Lightweight and fast
- ✅ Excellent monorepo support
- ✅ Great extension ecosystem
- ✅ Integrated terminal for all 4 LLMs
- ✅ Built-in git integration
- ✅ Perfect for multi-folder projects

**Setup** (already created for you):
```bash
cd ~/Projects/hfsp-labs-colosseum-dev
code clawdrop.code-workspace

# This opens all 3 folders in one IDE window:
# - Root (Clawdrop)
# - packages/clawdrop-mcp (MCP Server)
# - packages/agent-provisioning (Agent Provisioning)
```

### **Essential VS Code Extensions**

Install these from VS Code Extensions Marketplace:

```
1. GitLens (eamodio.gitlens)
   - Track who owns what code
   - Visual git history
   - Author tracking

2. TypeScript + JavaScript (ms-vscode.vscode-typescript-next)
   - Better type checking
   - Instant error detection

3. Prettier (esbenp.prettier-vscode)
   - Code formatting consistency
   - Auto-format on save

4. ESLint (dbaeumer.vscode-eslint)
   - Code quality checks
   - Catch issues early

5. Todo Tree (gruntfuggly.todo-tree)
   - Track TODO/FIXME across codebase
   - See blockers at a glance

6. Thunder Client (rangav.vscode-thunder-client)
   - REST API testing (for Gemini)
   - No external tool needed

7. YAML/JSON Extensions
   - Better config file support
```

**Install All At Once**:
```bash
code --install-extension eamodio.gitlens
code --install-extension ms-vscode.vscode-typescript-next
code --install-extension esbenp.prettier-vscode
code --install-extension dbaeumer.vscode-eslint
code --install-extension gruntfuggly.todo-tree
code --install-extension rangav.vscode-thunder-client
```

---

## 📊 Orchestration Tools (Already Set Up For You)

### **1. Orchestration Status Dashboard**

**Quick Status Check** (Run anytime):
```bash
cd ~/Projects/hfsp-labs-colosseum-dev
./tools/orchestration-dashboard/status.sh

# Shows:
# - Current status of each LLM
# - Git branches and recent commits
# - All blockers
# - Dependency information
```

**Output Example**:
```
╔════════════════════════════════════════════════════════════════════════════╗
║              CLAWDROP ORCHESTRATION STATUS DASHBOARD                       ║
╚════════════════════════════════════════════════════════════════════════════╝

┌─ CLAUDE ────────────────────────────────┐
Status: Fixing TypeScript errors
Current Tasks:
- [ ] Fix remaining 20 TypeScript errors
- [ ] Validate type definitions
Blocked By: None
└─────────────────────────────────────────┘

[Similar output for GEMINI, CODEX, KIMI]
```

### **2. Quick Commands Reference**

**File Location**: `tools/QUICK_COMMANDS.md`

**Common commands** (all LLMs):
```bash
# Check your tasks
cat ~/.clawdrop-status/[YOUR_NAME].md

# Check everyone's status
./tools/orchestration-dashboard/status.sh

# Check blockers
grep -r "Blocked By" ~/.clawdrop-status/

# See file ownership
grep -r "owns\|Owns" MULTI_LLM_WORKFLOW.md

# Update your status (daily)
nano ~/.clawdrop-status/[YOUR_NAME].md
```

### **3. VS Code Workspace Tasks**

**Built-in tasks** (Press Ctrl+Shift+P → "Run Task"):

```
📦 Build All Packages
  npm run build

🧪 Test All
  npm test

🚀 Start MCP Server
  npm run dev (in packages/clawdrop-mcp)

📋 Check Status
  Shows current task status
```

---

## 🔄 Real-Time Visibility Setup

### **GitHub Project Board** (Optional but recommended)

**Set up in 10 minutes**:

1. Go to GitHub → Your repo → Projects tab
2. Create new project: "Clawdrop Development"
3. Create columns:
   - ➜ Backlog
   - 👷 In Progress (Claude)
   - 👷 In Progress (Gemini)
   - 👷 In Progress (Codex)
   - 👷 In Progress (Kimi)
   - 🔍 In Review
   - ✅ Done

4. Add this to your status file format:
   ```
   ### GitHub Project Link
   https://github.com/lpsmurf/hfsp-labs-colosseum/projects/1
   ```

**Benefits**:
- ✅ All 4 LLMs see real-time updates
- ✅ PRs auto-link to tasks
- ✅ Dependency tracking
- ✅ Progress visualization

---

## 🚀 Workflow with IDE/Orchestration Tools

### **Daily Startup** (All LLMs)

```bash
# 1. Navigate and update
cd ~/Projects/hfsp-labs-colosseum-dev
./tools/orchestration-dashboard/status.sh

# 2. Check your tasks
cat ~/.clawdrop-status/[YOUR_NAME].md

# 3. Open IDE
code clawdrop.code-workspace

# 4. Pull latest
git pull origin main

# 5. Create working branch
git checkout -b feature/[YOUR_NAME]/[scope]

# 6. Start working
npm run build  # Verify setup
```

### **During Development**

```bash
# In VS Code terminal, run tasks:
# - Ctrl+Shift+P → "Run Task"
# - Select "Build All" or "Start MCP Server"

# Use GitLens (left side) to:
# - See who owns each function
# - Track changes over time
# - Blame specific lines

# Use Todo Tree to:
# - Find all FIXME comments
# - Track blockers in code
```

### **Ready to Commit**

```bash
# Pre-commit hook reminds you to update status
git commit -m "[YOUR_NAME] scope: description"

# Push branch
git push origin feature/[YOUR_NAME]/[scope]

# Create PR on GitHub (use template)
# Claude reviews and merges
```

---

## 💡 Advanced Orchestration (Optional)

### **NX Monorepo Tool** (Adds automatic dependency tracking)

**Install** (optional):
```bash
cd ~/Projects/hfsp-labs-colosseum-dev
npm install -D nx @nrwl/workspace
```

**Commands** (shows what depends on what):
```bash
# See dependency graph
npx nx graph

# Run builds in parallel
npx nx run-many --target=build --parallel

# Only test affected packages
npx nx affected:test

# Smart caching for faster builds
npx nx build --cache
```

**Why add NX?**
- ✅ Automatic dependency tracking
- ✅ Visual graph of package relationships
- ✅ Parallel execution (faster builds)
- ✅ Smart caching (don't rebuild everything)

---

## 🎯 IDE Comparison for Your Setup

| Feature | VS Code | WebStorm | Cursor |
|---------|---------|----------|--------|
| **Monorepo Support** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Git Visualization** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Dependency Graph** | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| **AI Integration** | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Terminal Support** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Lightweight** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| **Cost** | Free | $$$ | Free (with Claude) |

**Recommendation**:
- **Best for you**: **VS Code** (+ NX for fancy features)
- **If budget**: WebStorm (best dependency tracking)
- **If deeply integrated with Claude**: Cursor (AI-first IDE)

---

## 🛠️ Your Current Setup

### **Already Created For You**

✅ **clawdrop.code-workspace**
- Opens all 3 folders in VS Code
- Pre-configured settings
- Built-in task definitions
- Extension recommendations

✅ **tools/orchestration-dashboard/status.sh**
- Real-time status of all 4 LLMs
- Git activity tracking
- Blocker detection
- One-command visibility

✅ **tools/QUICK_COMMANDS.md**
- Fast reference guide
- Copy-paste ready commands
- For all LLMs

✅ **Git hooks**
- Pre-commit reminders
- Status file checks
- Author tracking

---

## 📚 How to Use Everything Together

### **Scenario: You're Claude, Need to Fix TypeScript Errors**

```bash
# 1. Start your day
cd ~/Projects/hfsp-labs-colosseum-dev
./tools/orchestration-dashboard/status.sh
# → See you're assigned to fix TypeScript errors
# → See Gemini is blocked waiting on you

# 2. Update your status
nano ~/.clawdrop-status/CLAUDE.md
# Change "- [ ] Fix remaining 20 TypeScript errors"
# To "🚧 In Progress - Currently fixing payment.ts"

# 3. Open IDE
code clawdrop.code-workspace
# → All 3 packages visible
# → Terminal ready
# → GitLens shows file ownership

# 4. Work on TypeScript errors
# - Click on error in editor
# - GitLens shows who last touched this code
# - Fixes are immediately type-checked
# - Run "Build All" task to verify

# 5. When done, commit
git commit -m "[CLAUDE] core: fix typescript errors in payment service"
# → Pre-commit hook reminds you to update status
nano ~/.clawdrop-status/CLAUDE.md
# Change to "- [x] Fix remaining 20 TypeScript errors"

# 6. Create PR
git push origin feature/claude/typescript-fixes
# → GitHub auto-links your commit to project board
# → Mark as "Ready for Review"
```

### **Scenario: You're Gemini, Waiting for Claude**

```bash
# Check dashboard
./tools/orchestration-dashboard/status.sh
# → See Claude is "In Progress - Currently fixing payment.ts"
# → You're "Blocked By: Claude's TypeScript fix"

# Update your status to reflect progress on independent tasks
nano ~/.clawdrop-status/GEMINI.md
# Add: "Currently: Reviewing existing payment service code"

# Keep coding review documents ready
# When Claude unblocks you, you're ready to merge

# Once Claude signals (pushes fix), pull and start work
git pull origin main
git checkout -b feature/gemini/payment-optimization
npm run build  # Now should pass!
```

---

## ✅ Checklist: Set Up IDE & Orchestration

- [x] **VS Code Workspace** created: `clawdrop.code-workspace`
- [x] **Status Dashboard** created: `tools/orchestration-dashboard/status.sh`
- [x] **Quick Commands** created: `tools/QUICK_COMMANDS.md`
- [x] **Git Hooks** created: `.git/hooks/pre-commit`
- [ ] Open workspace: `code clawdrop.code-workspace`
- [ ] Install extensions (listed above)
- [ ] Test dashboard: `./tools/orchestration-dashboard/status.sh`
- [ ] (Optional) Install NX: `npm install -D nx`

---

## 🎯 Pro Tips

1. **Use multiple terminals** in VS Code
   - Terminal 1: Watch MCP server (Claude)
   - Terminal 2: Run tests (Gemini)
   - Terminal 3: Test CLI (Codex)
   - Terminal 4: Deploy status (Kimi)

2. **Bookmark quick commands**
   ```bash
   alias clawdrop-status="./tools/orchestration-dashboard/status.sh"
   alias clawdrop-cd="cd ~/Projects/hfsp-labs-colosseum-dev"
   ```

3. **Daily standup format**
   ```bash
   ./tools/orchestration-dashboard/status.sh > standup-$(date +%Y%m%d).txt
   # Share with team
   ```

4. **GitHub Project Board notifications**
   - Watch your columns
   - Get notified when moved to "In Review"
   - See when Claude approves PR

---

## 🚀 Next Steps

1. **Install VS Code** (if not already): `code .`
2. **Open workspace**: `code clawdrop.code-workspace`
3. **Install recommended extensions** (VS Code will prompt)
4. **Run dashboard**: `./tools/orchestration-dashboard/status.sh`
5. **Start developing**!

---

**The orchestration tools are ready. IDE is configured. You're good to go! 🎉**

