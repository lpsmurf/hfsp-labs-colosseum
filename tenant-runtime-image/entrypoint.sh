#!/usr/bin/env bash
set -euo pipefail

# Expect tenant paths mounted to:
#  - /tenant/workspace
#  - /tenant/secrets
#  - /tenant/openclaw.json

mkdir -p /home/clawd/.openclaw/secrets

# Link secrets and config into the default OpenClaw locations.
ln -sf /tenant/secrets /home/clawd/.openclaw/secrets
mkdir -p /home/clawd/.openclaw
ln -sf /tenant/openclaw.json /home/clawd/.openclaw/openclaw.json

# Ensure workspace exists
mkdir -p /tenant/workspace

# Drop privileges
exec su -s /bin/bash -c "openclaw gateway run --force" clawd
