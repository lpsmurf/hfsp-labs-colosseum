#!/usr/bin/env bash
set -euo pipefail

mkdir -p /tenant/workspace

# Resolve provider keys — env var takes precedence, secrets file is fallback
ANTHROPIC_KEY="${ANTHROPIC_API_KEY:-}"
if [[ -z "$ANTHROPIC_KEY" ]] && [[ -f /home/clawd/.openclaw/secrets/anthropic.key ]]; then
  ANTHROPIC_KEY="$(tr -d '\r\n' < /home/clawd/.openclaw/secrets/anthropic.key)"
fi

OPENAI_KEY="${OPENAI_API_KEY:-}"
if [[ -z "$OPENAI_KEY" ]] && [[ -f /home/clawd/.openclaw/secrets/openai.key ]]; then
  OPENAI_KEY="$(tr -d '\r\n' < /home/clawd/.openclaw/secrets/openai.key)"
fi

OPENROUTER_KEY="${OPENROUTER_API_KEY:-}"
if [[ -z "$OPENROUTER_KEY" ]] && [[ -f /home/clawd/.openclaw/secrets/openrouter.key ]]; then
  OPENROUTER_KEY="$(tr -d '\r\n' < /home/clawd/.openclaw/secrets/openrouter.key)"
fi

TG_TOKEN="${TELEGRAM_BOT_TOKEN:-}"

CMD_PREFIX="HOME=/home/clawd"
[[ -n "$ANTHROPIC_KEY" ]]  && CMD_PREFIX+=" ANTHROPIC_API_KEY=\"$ANTHROPIC_KEY\""
[[ -n "$OPENAI_KEY" ]]     && CMD_PREFIX+=" OPENAI_API_KEY=\"$OPENAI_KEY\""
[[ -n "$OPENROUTER_KEY" ]] && CMD_PREFIX+=" OPENROUTER_API_KEY=\"$OPENROUTER_KEY\""
[[ -n "$TG_TOKEN" ]]       && CMD_PREFIX+=" TELEGRAM_BOT_TOKEN=\"$TG_TOKEN\""

exec su -s /bin/bash -c "$CMD_PREFIX openclaw gateway run --force" clawd
