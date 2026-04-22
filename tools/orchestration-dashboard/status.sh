#!/bin/bash

# Orchestration Status Dashboard
clear
echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║              CLAWDROP ORCHESTRATION STATUS DASHBOARD                       ║"
echo "║                   $(date '+%Y-%m-%d %H:%M:%S')                            ║"
echo "╚════════════════════════════════════════════════════════════════════════════╝"
echo ""

for llm in CLAUDE GEMINI CODEX KIMI; do
  echo "┌─ $llm ─────────────────────────────────────────────────────────────┐"
  
  status_file="$HOME/.clawdrop-status/$llm.md"
  
  if [ -f "$status_file" ]; then
    # Extract key info from status file
    echo "Status:"
    grep -E "^## |^### |^- \[" "$status_file" | head -8
  else
    echo "❌ Status file not found: $status_file"
  fi
  echo "└─────────────────────────────────────────────────────────────────────┘"
  echo ""
done

# Show git status
echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║                        GIT ACTIVITY                                        ║"
echo "╚════════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "Active branches:"
git branch -a | grep -v "^\s*remotes"
echo ""
echo "Recent commits:"
git log --oneline -10 --graph

echo ""
echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║                      DEPENDENCY BLOCKERS                                   ║"
echo "╚════════════════════════════════════════════════════════════════════════════╝"
echo ""
grep -r "Blocked By" ~/.clawdrop-status/ 2>/dev/null || echo "✅ No blockers!"

