#!/usr/bin/env bash
set -euo pipefail

# Tenant runtime entrypoint
# - openclaw.json is bind-mounted read-only to: /home/clawd/.openclaw/openclaw.json
# - secrets dir is bind-mounted read-only to: /home/clawd/.openclaw/secrets
# - workspace is bind-mounted to: /tenant/workspace
#
# IMPORTANT: Do not create symlinks in /home/clawd/.openclaw when mounts are read-only.

mkdir -p /tenant/workspace

# Resolve provider keys from mounted secrets.
# IMPORTANT: `su` typically clears env vars, so we pass them inline to the command.
ANTHROPIC_KEY="${ANTHROPIC_API_KEY:-}"
if [[ -z "$ANTHROPIC_KEY" ]] && [[ -f /home/clawd/.openclaw/secrets/anthropic.key ]]; then
  ANTHROPIC_KEY="$(tr -d '\r\n' < /home/clawd/.openclaw/secrets/anthropic.key)"
fi

OPENAI_KEY="${OPENAI_API_KEY:-}"
if [[ -z "$OPENAI_KEY" ]] && [[ -f /home/clawd/.openclaw/secrets/openai.key ]]; then
  OPENAI_KEY="$(tr -d '\r\n' < /home/clawd/.openclaw/secrets/openai.key)"
fi

# Drop privileges and run gateway
# IMPORTANT:
# - Do NOT use `su -m` here, because it preserves HOME=/root and OpenClaw then
#   looks for /root/.openclaw/openclaw.json ("Missing config" + default port 18789).
# - Instead, pass HOME + keys inline.
CMD_PREFIX="HOME=/home/clawd"
if [[ -n "$ANTHROPIC_KEY" ]]; then
  CMD_PREFIX+=" ANTHROPIC_API_KEY=\"$ANTHROPIC_KEY\""
fi
if [[ -n "$OPENAI_KEY" ]]; then
  CMD_PREFIX+=" OPENAI_API_KEY=\"$OPENAI_KEY\""
fi

exec su -s /bin/bash -c "$CMD_PREFIX openclaw gateway run --force" clawd
