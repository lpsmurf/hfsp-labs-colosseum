#!/usr/bin/env bash
# Phase 2 of the version-drift heads-up: re-emit the line computed earlier by
# check_version.sh, as the LAST tool call before the model composes its reply.
#
# Its ENTIRE stdout is the bare markdown blockquote (no local=/remote=/status=
# keys), so it can be relayed verbatim with zero risk of a raw-stdout dump.
# Prints nothing (exit 0) when there is no drift to report — the model then
# stays silent about the version.
#
# Why a separate step: only the model's FINAL reply is user-visible, and it
# surfaces what is freshest in context. Running this LAST — after the user's
# task — makes the heads-up the most recent tool output, so it survives into
# the final reply instead of being buried behind the task result.
set -euo pipefail

SKILL_DIR="${CLAUDE_SKILL_DIR:-"$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"}"
HEADSUP_CACHE="${SKILL_DIR}/.headsup_cache"

if [ -s "${HEADSUP_CACHE}" ]; then
  cat "${HEADSUP_CACHE}"
  exit 0
fi

# Cache missing (e.g. read-only dir, or check not run yet this session): fall
# back to recomputing so we never stay silent when actually behind. We re-run
# check_version.sh and keep only its headsup= line, stripped of the key.
check_out="$(bash "${SKILL_DIR}/scripts/check_version.sh" 2>/dev/null || true)"
printf '%s\n' "${check_out}" | sed -n 's/^headsup=//p' | head -n1
