#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════
#  Clawdrop Standup — run anytime during the day
#  Shows: who's working on what, what's blocked, what's
#  ready to hand off. Takes ~3 seconds.
#
#  Usage: bash scripts/standup.sh
# ═══════════════════════════════════════════════════════

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

B="\033[1m"; R="\033[0m"; GR="\033[92m"; CY="\033[96m"
YL="\033[93m"; RD="\033[91m"; DIM="\033[2m"; PU="\033[95m"

emoji() { case "$1" in claude) echo "🟣";; kimi) echo "🟦";; codex) echo "🟩";; gemini) echo "🟨";; *) echo "⬜";; esac; }
upper() { echo "$1" | tr '[:lower:]' '[:upper:]'; }

NOW=$(date -u '+%H:%M UTC')
TODAY=$(date -u '+%Y-%m-%d')

printf "\n${CY}${B}  ⚡ CLAWDROP STANDUP  ${R}${DIM}${NOW}${R}\n"
printf "${CY}  ──────────────────────────────────────────${R}\n"

WORKLOG="$REPO_ROOT/.claude/WORKLOG.md"
HANDOFFS="$REPO_ROOT/.claude/HANDOFFS.md"

# ── AGENT STATUS ────────────────────────────────────────
printf "\n${B}  WHO IS DOING WHAT${R}\n\n"

for AGENT in claude kimi codex gemini; do
  E=$(emoji "$AGENT")
  U=$(upper "$AGENT")

  if [ ! -f "$WORKLOG" ]; then
    printf "  ${DIM}WORKLOG.md not found${R}\n"
    break
  fi

  STATUS=$(grep "## ${U} —" "$WORKLOG" 2>/dev/null \
    | grep -o 'WORKING\|DONE\|BLOCKED\|WAITING\|UNKNOWN' || echo "UNKNOWN")
  TASK=$(grep -A3 "## ${U} —" "$WORKLOG" 2>/dev/null \
    | grep "Current task:" | sed 's/\*\*Current task\*\*: //' | head -1 || echo "?")
  BRANCH=$(grep -A4 "## ${U} —" "$WORKLOG" 2>/dev/null \
    | grep "Branch:" | sed 's/\*\*Branch\*\*: //' | head -1 || echo "")
  BLOCKING=$(grep -A5 "## ${U} —" "$WORKLOG" 2>/dev/null \
    | grep "Blocking:" | sed 's/\*\*Blocking\*\*: //' | head -1 || echo "none")

  # Count today's commits for this agent
  COMMITS=$(git log --all --format="%s" \
    --after="${TODAY} 00:00" 2>/dev/null \
    | grep -ic "\[${AGENT}\]" || echo 0)

  case "$STATUS" in
    DONE)
      printf "  ${E} ${B}${U}${R}  ${GR}DONE${R}  ${DIM}${TASK}${R}\n"
      ;;
    WORKING)
      printf "  ${E} ${B}${U}${R}  ${YL}WORKING${R}  ${TASK}\n"
      [ -n "$BRANCH" ] && printf "    ${DIM}branch: ${BRANCH}${R}\n"
      [ "$BLOCKING" != "none" ] && [ -n "$BLOCKING" ] && \
        printf "    ${PU}blocks: ${BLOCKING}${R}\n"
      ;;
    BLOCKED)
      printf "  ${E} ${B}${U}${R}  ${RD}BLOCKED${R}  ${TASK}\n"
      ;;
    WAITING)
      printf "  ${E} ${B}${U}${R}  ${YL}WAITING${R}  ${TASK}\n"
      ;;
    *)
      printf "  ${E} ${B}${U}${R}  ${DIM}UNKNOWN — needs to update WORKLOG.md${R}\n"
      ;;
  esac

  printf "    ${DIM}commits today: ${COMMITS}${R}\n"
done

# ── INBOX CHECK ─────────────────────────────────────────
printf "\n${B}  UNREAD INBOX MESSAGES${R}\n\n"

if [ -f "$WORKLOG" ]; then
  HAS_INBOX=0
  for AGENT in claude kimi codex gemini; do
    U=$(upper "$AGENT")
    E=$(emoji "$AGENT")
    # Check if inbox has content beyond "[clear]"
    INBOX=$(awk "/## ${U} —/,/## [A-Z]+ —/" "$WORKLOG" 2>/dev/null \
      | grep -A5 "\*\*Inbox\*\*:" | grep -v "\*\*Inbox\*\*:" \
      | grep -v "^\-\-$" | grep -v "^\[clear\]$" | grep -v "^$" | head -3 || true)
    if [ -n "$INBOX" ]; then
      HAS_INBOX=1
      printf "  ${E} ${B}${U} inbox:${R}\n"
      while IFS= read -r line; do
        printf "    ${DIM}${line}${R}\n"
      done <<< "$INBOX"
    fi
  done
  [ "$HAS_INBOX" -eq 0 ] && printf "  ${DIM}All inboxes clear${R}\n"
else
  printf "  ${DIM}No WORKLOG.md${R}\n"
fi

# ── RECENT HANDOFFS ──────────────────────────────────────
printf "\n${B}  LATEST HANDOFF${R}\n\n"

if [ -f "$HANDOFFS" ]; then
  # Show the last handoff entry
  LAST=$(grep -A6 "^## " "$HANDOFFS" | tail -8 | grep -v "^--$" || true)
  if [ -n "$LAST" ]; then
    while IFS= read -r line; do
      printf "  ${DIM}${line}${R}\n"
    done <<< "$LAST"
  else
    printf "  ${DIM}No handoffs yet${R}\n"
  fi
else
  printf "  ${DIM}No HANDOFFS.md${R}\n"
fi

# ── QUICK HEALTH ─────────────────────────────────────────
printf "\n${B}  QUICK HEALTH${R}\n\n"

chk() {
  local label="$1"; shift
  if "$@" &>/dev/null; then
    printf "  ${GR}✅${R}  ${label}\n"
  else
    printf "  ${RD}❌${R}  ${label}\n"
  fi
}

chk "MCP server runnable"   test -f /Users/mac/clawdrop-mcp/dist/index.js
chk "trial tools built"     test -f packages/trial-api/dist/tools/index.js
chk "trial server built"    test -f packages/trial-api/dist/server.js
chk "clawdrop.live up"      curl -sf --max-time 4 https://clawdrop.live -o /dev/null
chk "/api/health live"      curl -sf --max-time 4 https://clawdrop.live/api/health -o /dev/null

# ── OPEN PRs ────────────────────────────────────────────
if command -v gh &>/dev/null; then
  PR_COUNT=$(gh pr list --json number 2>/dev/null | python3 -c "import sys,json;print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
  if [ "$PR_COUNT" -gt 0 ]; then
    printf "\n${B}  OPEN PRs (${PR_COUNT})${R}\n\n"
    gh pr list --json number,title,headRefName,reviewDecision 2>/dev/null \
    | python3 -c "
import sys, json
prs = json.load(sys.stdin)
emojis = {'claude':'🟣','kimi':'🟦','codex':'🟩','gemini':'🟨'}
for pr in prs:
    branch = pr.get('headRefName','?')
    agent = branch.split('/')[0] if '/' in branch else '?'
    e = emojis.get(agent,'⬜')
    rev = pr.get('reviewDecision','') or 'needs review'
    print(f\"  {e} PR #{pr['number']}: {pr['title']}\")
    print(f\"    {branch} — {rev}\")
" 2>/dev/null
  fi
fi

printf "\n${DIM}  Update your status: edit .claude/WORKLOG.md${R}\n"
printf "${DIM}  End of day report:  bash scripts/day-close.sh${R}\n\n"
