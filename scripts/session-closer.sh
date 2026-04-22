#!/bin/bash

# Session Closer: Generate end-of-day summary and commit to SESSIONS/

set -e

# Inputs
DATE=$(date +%Y-%m-%d)
TIME=$(date +%H:%M:%S)
SESSION_TITLE="${1:-Daily Dev Session}"
SESSION_ID="${2:-session-$(date +%s)}"

REPO_ROOT=$(git rev-parse --show-toplevel)
SESSIONS_DIR="$REPO_ROOT/SESSIONS"
SUMMARY_FILE="$SESSIONS_DIR/$DATE-dev-session.md"

echo "🔄 Starting session closer..."
echo "   Date: $DATE"
echo "   Title: $SESSION_TITLE"
echo "   Session ID: $SESSION_ID"

# Create SESSIONS dir if missing
mkdir -p "$SESSIONS_DIR"

# Function to extract git commit log since session start
get_commit_log() {
  local hours_back=${1:-8}
  local since="$hours_back hours ago"
  git log --oneline --since="$since" --author="$(git config user.email)" -- . || echo "No commits in timeframe"
}

# Function to get changed file summary
get_file_summary() {
  echo "### Files Changed This Session"
  echo ""
  git diff --name-status HEAD~20..HEAD 2>/dev/null | awk '
    {
      if ($1 == "A") status = "Added"
      else if ($1 == "M") status = "Modified"
      else if ($1 == "D") status = "Deleted"
      else status = $1
      print "- **" status "**: " $2
    }
  ' || echo "- No git history available"
}

# Function to extract milestones from build-context
get_milestones() {
  if [ -f ~/.superstack/build-context.md ]; then
    grep -A 3 "build_status" ~/.superstack/build-context.md
  fi
}

# Generate summary markdown
cat > "$SUMMARY_FILE" << SUMMARY
# Dev Session Summary: $DATE

**Session ID**: \`$SESSION_ID\`  
**Date**: \`$DATE\`  
**Time**: \`$TIME\`  
**Focus**: $SESSION_TITLE

---

## 🎯 Accomplishments

$(get_milestones)

---

## 📋 Next Steps

Review \`~/.superstack/build-context.md\` for latest milestone and dependencies.

---

## 💾 Git Activity

\`\`\`
$(get_commit_log 8)
\`\`\`

$(get_file_summary)

---

## 📌 Key Files

- Build context: \`~/.superstack/build-context.md\`
- Architecture: \`AGENT_UX_ARCHITECTURE.md\`
- Agent brain: \`packages/agent-provisioning/services/agent-brain/\`

---

**Session closed**: $TIME  
**Next session ready**: [Check above]
SUMMARY

echo "✓ Summary written to: $SUMMARY_FILE"

# Commit summary
cd "$REPO_ROOT"
git add "$SUMMARY_FILE"
git commit -m "[SESSIONS] Daily dev summary: $DATE - $SESSION_TITLE

- Session ID: $SESSION_ID
- Focus: $SESSION_TITLE
- Date: $DATE

See $SUMMARY_FILE for details." || echo "⚠ Commit failed (no changes or git error)"

echo "✓ Session summary committed."
echo ""
echo "Next time, run:"
echo "  ./scripts/session-closer.sh 'Your session title'"
