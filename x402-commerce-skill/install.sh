#!/usr/bin/env bash
# Install the x402-commerce skill into a Solana AI Kit (or any Claude Code) project.
# Usage: bash install.sh /path/to/your-project
set -euo pipefail

DEST="${1:-.}"
TARGET="$DEST/.claude/skills/x402-commerce"
SRC="$(cd "$(dirname "$0")" && pwd)/skill"

if [ ! -f "$SRC/SKILL.md" ]; then
  echo "error: $SRC/SKILL.md not found — run from the skill repo root." >&2
  exit 1
fi

mkdir -p "$TARGET"
cp -R "$SRC/." "$TARGET/"
echo "installed x402-commerce → $TARGET"
echo "load it in Claude Code with: /x402-commerce  (or it auto-routes from the skill hub)"
