#!/usr/bin/env bash
# Clawdrop Day-Close Report
# Usage: bash scripts/day-close.sh [YYYY-MM-DD]

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

TARGET_DATE="${1:-$(date -u +%Y-%m-%d)}"
REPORT_DIR="$REPO_ROOT/SESSIONS"
REPORT_FILE="$REPORT_DIR/${TARGET_DATE}-day-close.md"
WORKLOG="$REPO_ROOT/.claude/WORKLOG.md"
mkdir -p "$REPORT_DIR"

B="\033[1m"; R="\033[0m"; GR="\033[92m"; CY="\033[96m"
YL="\033[93m"; RD="\033[91m"; DIM="\033[2m"

emoji() { case "$1" in claude) echo "🟣";; kimi) echo "🟦";; codex) echo "🟩";; gemini) echo "🟨";; *) echo "⬜";; esac; }
upper() { echo "$1" | tr '[:lower:]' '[:upper:]'; }

hr()   { printf "\n${CY}${B}%-60s${R}\n" "────────────────────────────────────────────────────────────"; }
ok()   { printf "  ${GR}✅  $1${R}\n"; }
warn() { printf "  ${YL}⚠️   $1${R}\n"; }
fail() { printf "  ${RD}❌  $1${R}\n"; }
dim()  { printf "  ${DIM}$1${R}\n"; }

printf "\n${CY}${B}"
printf "  ╔══════════════════════════════════════════════════════════╗\n"
printf "  ║          CLAWDROP  DAY-CLOSE  REPORT                    ║\n"
printf "  ║  Date: %-50s ║\n" "$TARGET_DATE"
printf "  ╚══════════════════════════════════════════════════════════╝${R}\n"

printf "  ${DIM}Fetching...${R}\n"
git fetch --all --quiet 2>/dev/null || true

# Write markdown header
cat > "$REPORT_FILE" << HEADER
# 🌙 Clawdrop Day-Close — $TARGET_DATE
Generated: $(date -u '+%Y-%m-%d %H:%M UTC')
---
HEADER

# ── COMMITS BY AGENT ──────────────────────────────────────────────
hr
printf "\n${B}${CY}  COMMITS BY AGENT${R}\n\n"
echo "## 📊 Commits by Agent" >> "$REPORT_FILE"

TOTAL=0
for AGENT in claude kimi codex gemini; do
  E=$(emoji "$AGENT")
  U=$(upper "$AGENT")
  
  COMMITS=$(git log --all \
    --format="%h %s" \
    --after="${TARGET_DATE} 00:00" \
    --before="${TARGET_DATE} 23:59:59" \
    2>/dev/null | grep -i "\[${AGENT}\]" || true)

  COUNT=0
  [ -n "$COMMITS" ] && COUNT=$(echo "$COMMITS" | grep -c "." || true)

  printf "\n  ${B}${E}  ${U}${R}  ${DIM}(${COUNT} commits)${R}\n"
  echo "" >> "$REPORT_FILE"
  echo "### $E $U ($COUNT commits)" >> "$REPORT_FILE"

  if [ "$COUNT" -eq 0 ]; then
    warn "No commits tagged [${AGENT}] today — check commit convention"
    echo "- ⚠️ No \`[${AGENT}]\` commits found" >> "$REPORT_FILE"
  else
    TOTAL=$((TOTAL + COUNT))
    while IFS= read -r line; do
      [ -z "$line" ] && continue
      HASH=$(echo "$line" | cut -d' ' -f1)
      MSG=$(echo "$line" | cut -d' ' -f2-)
      printf "    ${DIM}${HASH}${R}  ${MSG}\n"
      echo "- \`$HASH\` $MSG" >> "$REPORT_FILE"
    done <<< "$COMMITS"
  fi
done

# Untagged
UNTAGGED=$(git log --all --format="%h %s" \
  --after="${TARGET_DATE} 00:00" \
  --before="${TARGET_DATE} 23:59:59" \
  2>/dev/null \
  | grep -v "\[claude\]\|\[kimi\]\|\[codex\]\|\[gemini\]\|\[SESSIONS\]" \
  | grep -v "^$" || true)

if [ -n "$UNTAGGED" ]; then
  printf "\n  ${B}⬜  UNTAGGED${R}  ${RD}(missing agent prefix — fix this)${R}\n"
  echo "" >> "$REPORT_FILE"
  echo "### ⬜ Untagged (needs agent prefix)" >> "$REPORT_FILE"
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    printf "    ${RD}$(echo "$line" | cut -d' ' -f1)${R}  $(echo "$line" | cut -d' ' -f2-)\n"
    echo "- ⚠️ $line" >> "$REPORT_FILE"
  done <<< "$UNTAGGED"
fi

# ── FILES BY BRANCH ───────────────────────────────────────────────
hr
printf "\n${B}${CY}  FILES CHANGED BY BRANCH${R}\n\n"
echo "" >> "$REPORT_FILE"
echo "---" >> "$REPORT_FILE"
echo "## 📁 Files Changed by Branch" >> "$REPORT_FILE"

for BRANCH in $(git branch -a --format='%(refname:short)' 2>/dev/null | grep -E "^(origin/)?(claude|kimi|codex|gemini)/" | sed 's|origin/||' | sort -u | head -20); do
  AGENT_NAME=$(echo "$BRANCH" | cut -d'/' -f1)
  E=$(emoji "$AGENT_NAME")
  FILES=$(git diff --name-only "origin/main...origin/${BRANCH}" 2>/dev/null \
    || git diff --name-only "main...${BRANCH}" 2>/dev/null | head -15 || true)
  FILE_COUNT=0
  [ -n "$FILES" ] && FILE_COUNT=$(echo "$FILES" | grep -c "." || true)
  if [ "$FILE_COUNT" -gt 0 ]; then
    printf "\n  ${E} ${B}${BRANCH}${R}  ${DIM}(${FILE_COUNT} files)${R}\n"
    echo "" >> "$REPORT_FILE"
    echo "### $E \`$BRANCH\` ($FILE_COUNT files)" >> "$REPORT_FILE"
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      printf "    ${DIM}${f}${R}\n"
      echo "- \`$f\`" >> "$REPORT_FILE"
    done <<< "$FILES"
  fi
done

# ── OPEN PRs ──────────────────────────────────────────────────────
hr
printf "\n${B}${CY}  OPEN PULL REQUESTS${R}\n\n"
echo "" >> "$REPORT_FILE"
echo "---" >> "$REPORT_FILE"
echo "## 🔀 Open Pull Requests" >> "$REPORT_FILE"

if command -v gh &>/dev/null; then
  gh pr list --json number,title,headRefName,reviewDecision 2>/dev/null \
  | python3 -c "
import sys, json, os
prs = json.load(sys.stdin)
emojis = {'claude':'🟣','kimi':'🟦','codex':'🟩','gemini':'🟨'}
if not prs:
    print('  No open PRs')
for pr in prs:
    branch = pr.get('headRefName','?')
    agent = branch.split('/')[0] if '/' in branch else 'unknown'
    e = emojis.get(agent, '⬜')
    rev = pr.get('reviewDecision','') or 'PENDING'
    print(f\"  {e} PR #{pr['number']}: {pr['title']}\")
    print(f\"     {branch} — {rev}\")
    print(f\"- {e} PR #{pr['number']}: {pr['title']} ({branch}) — {rev}\", file=open(os.environ.get('REPORT_FILE',''), 'a') if os.environ.get('REPORT_FILE') else sys.stderr)
" REPORT_FILE="$REPORT_FILE" 2>/dev/null || dim "Could not parse PRs"
else
  warn "gh CLI not installed — install with: brew install gh"
  echo "- gh CLI not available" >> "$REPORT_FILE"
fi

# ── WORKLOG STATUS ────────────────────────────────────────────────
hr
printf "\n${B}${CY}  WORKLOG STATUS${R}\n\n"
echo "" >> "$REPORT_FILE"
echo "---" >> "$REPORT_FILE"
echo "## 📋 Worklog Status" >> "$REPORT_FILE"

if [ -f "$WORKLOG" ]; then
  for AGENT in claude kimi codex gemini; do
    E=$(emoji "$AGENT")
    U=$(upper "$AGENT")
    STATUS=$(grep "## ${U} —" "$WORKLOG" 2>/dev/null | grep -o 'WORKING\|DONE\|BLOCKED\|WAITING\|UNKNOWN' || echo "UNKNOWN")
    TASK=$(grep -A3 "## ${U} —" "$WORKLOG" 2>/dev/null | grep "Current task:" | sed 's/\*\*Current task\*\*: //' | head -1 || echo "unknown")
    case "$STATUS" in
      DONE)    ok "${U}: DONE — ${TASK}" ;;
      WORKING) printf "  ${YL}⚙️   ${U}: WORKING — ${TASK}${R}\n" ;;
      BLOCKED) fail "${U}: BLOCKED — ${TASK}" ;;
      WAITING) warn "${U}: WAITING — ${TASK}" ;;
      *)       dim "${U}: UNKNOWN — update WORKLOG.md" ;;
    esac
    echo "- $E **$U**: $STATUS — $TASK" >> "$REPORT_FILE"
  done
else
  warn "WORKLOG.md missing — create it at .claude/WORKLOG.md"
  echo "- ⚠️ WORKLOG.md not found" >> "$REPORT_FILE"
fi

# ── INTEGRATION CHECKS ────────────────────────────────────────────
hr
printf "\n${B}${CY}  INTEGRATION CHECKLIST${R}\n\n"
echo "" >> "$REPORT_FILE"
echo "---" >> "$REPORT_FILE"
echo "## 🧪 Integration Checklist" >> "$REPORT_FILE"

chk() {
  local label="$1"; shift
  if "$@" &>/dev/null; then
    ok "$label"; echo "- ✅ $label" >> "$REPORT_FILE"
    return 0
  else
    fail "$label"; echo "- ❌ $label" >> "$REPORT_FILE"
    return 1
  fi
}

chk "trial-api package exists"       test -d packages/trial-api
chk "trial tools built"              test -f packages/trial-api/dist/tools/index.js
chk "trial server built"             test -f packages/trial-api/dist/server.js
chk "WORKLOG.md exists"              test -f .claude/WORKLOG.md
chk "HANDOFFS.md exists"             test -f .claude/HANDOFFS.md
chk "clawdrop.live reachable"        curl -sf --max-time 5 https://clawdrop.live -o /dev/null
chk "/api/health live"               curl -sf --max-time 5 https://clawdrop.live/api/health -o /dev/null

# ── TOMORROW'S ASSIGNMENTS ────────────────────────────────────────
hr
printf "\n${B}${CY}  TOMORROW'S ASSIGNMENTS${R}\n\n"
echo "" >> "$REPORT_FILE"
echo "---" >> "$REPORT_FILE"
echo "## 🌅 Tomorrow's Assignments" >> "$REPORT_FILE"

TOOLS_DONE=$(test -f packages/trial-api/dist/tools/index.js && echo yes || echo no)
SERVER_DONE=$(test -f packages/trial-api/dist/server.js && echo yes || echo no)
API_LIVE=$(curl -sf --max-time 5 https://clawdrop.live/api/health -o /dev/null 2>/dev/null && echo yes || echo no)
TRY_PAGE=$(find packages services -name "Try.tsx" 2>/dev/null | head -1)

task() {
  local agent="$1"; local e=$(emoji "$agent"); local u=$(upper "$agent"); shift
  printf "\n  ${B}${e}  ${u}${R}\n"
  echo "" >> "$REPORT_FILE"
  echo "### $e $u" >> "$REPORT_FILE"
  for t in "$@"; do
    printf "    ${DIM}→ ${t}${R}\n"
    echo "- $t" >> "$REPORT_FILE"
  done
}

if [ "$TOOLS_DONE" = "no" ]; then
  task "claude" \
    "Complete 5 Poly tools (sol-price, token-price, wallet-balance, recent-txns, token-safety)" \
    "Verify: node -e \"import('./packages/trial-api/dist/tools/index.js').then(m=>m.getSolPrice.execute({context:{}})).then(console.log)\"" \
    "Push claude/trial-tools → open PR → write to Kimi inbox in WORKLOG.md"
else
  task "claude" \
    "Review Kimi's poly-agent.ts tool wiring (tools are ready)" \
    "Write REVIEW_kimi_day$(date -u +%d).md with pass/fail + required fixes" \
    "Run E2E: curl -X POST localhost:8787/api/chat -d '{\"message\":\"sol price?\",\"sessionId\":\"t\"}' --no-buffer" \
    "Check Codex mobile at 375px — file issues in WORKLOG Codex inbox"
fi

if [ "$SERVER_DONE" = "no" ]; then
  task "kimi" \
    "Fix SSE streaming: Mastra stream via manual async iterator in Express" \
    "Wire polyTools into poly-agent.ts (check HANDOFFS.md for import details)" \
    "Test: POST /api/chat must stream [tool_call] event before [delta] events" \
    "Expose endpoint (localhost or ngrok) so Codex can connect"
else
  task "kimi" \
    "Add GET /api/quota?ip= endpoint" \
    "Deploy trial-api to VPS or provide ngrok URL to Codex" \
    "Write scripts/test-api.sh smoke test script"
fi

if [ -z "$TRY_PAGE" ]; then
  task "codex" \
    "Build src/pages/Try.tsx — hero + full-height chatbox + message counter" \
    "Build src/hooks/useTrialChat.ts with MOCK SSE (don't wait for Kimi)" \
    "Build ToolCallCard.tsx — collapsible, color by tool type" \
    "Open Chrome DevTools → iPhone 14 Pro → verify layout at 375px first"
else
  task "codex" \
    "Connect useTrialChat to real /api/chat endpoint (get URL from Kimi inbox)" \
    "Build PaywallModal.tsx — triggers on message 11 or 429 response" \
    "iPhone Safari test on actual device" \
    "Run Lighthouse mobile — fix anything below 80"
fi

if [ "$API_LIVE" = "no" ]; then
  task "gemini" \
    "URGENT: verify Mac Mini services are running (pm2 list) and Cloudflare Tunnel is active" \
    "Test after: curl https://clawdrop.live/api/health must return 200" \
    "Update landing hero: CTA button → 'Try Poly free →' linking to /try" \
    "Check cloudflared tunnel logs: cloudflared tunnel --loglevel debug run clawdrop-live"
else
  task "gemini" \
    "Write 60-second demo video script (word-for-word voiceover + screen beats)" \
    "Draft 5-tweet launch thread for Friday 4pm UTC" \
    "Write hackathon submission text for Colosseum (200 words)" \
    "5 tagline options for landing A/B test"
fi

# ── SUMMARY ───────────────────────────────────────────────────────
hr
printf "\n${B}${CY}  DAY SUMMARY${R}\n\n"
echo "" >> "$REPORT_FILE"
echo "---" >> "$REPORT_FILE"
echo "## 📈 Day Summary" >> "$REPORT_FILE"

ALL=$(git log --all --format="%h" \
  --after="${TARGET_DATE} 00:00" \
  --before="${TARGET_DATE} 23:59:59" \
  2>/dev/null | wc -l | tr -d ' ')
DONE_N=$(grep -c "Status: DONE" "$WORKLOG" 2>/dev/null || echo 0)
BLOCKED_N=$(grep -cE "Status: BLOCKED|Status: WAITING" "$WORKLOG" 2>/dev/null || echo 0)

printf "  Total commits today:  ${B}${ALL}${R}\n"
printf "  Tagged commits:       ${B}${TOTAL}${R}\n"
printf "  Agents done:          ${B}${DONE_N} / 4${R}\n"
printf "  Agents blocked:       ${B}${BLOCKED_N}${R}\n"

{
echo ""
echo "| Metric | Value |"
echo "|---|---|"
echo "| Total commits today | $ALL |"
echo "| Tagged commits (with agent prefix) | $TOTAL |"
echo "| Agents DONE | $DONE_N / 4 |"
echo "| Agents blocked/waiting | $BLOCKED_N |"
} >> "$REPORT_FILE"

# ── SAVE ─────────────────────────────────────────────────────────
printf "\n  ${GR}${B}Report: ${REPORT_FILE}${R}\n"
git add "$REPORT_FILE" ".claude/WORKLOG.md" ".claude/HANDOFFS.md" 2>/dev/null || true
git commit -m "[claude] orchestration: day-close report ${TARGET_DATE}" --no-verify 2>/dev/null \
  && printf "  ${GR}✅ Committed${R}\n" \
  || printf "  ${DIM}Nothing new to commit${R}\n"

printf "\n  ${DIM}Tomorrow: cat .claude/WORKLOG.md && cat .claude/HANDOFFS.md${R}\n\n"
