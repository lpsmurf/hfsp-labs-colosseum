#!/usr/bin/env bash
# VPS → Mac Mini Migration Script
# Run on Mac Mini. Deadline: cancel piercalito VPS by May 31 2026.
#
# USAGE:
#   bash scripts/migrate-to-mac-mini.sh [step]
#
#   Steps: ssh-export | tunnel | pm2 | verify | all
#   Default: runs all steps interactively.

set -euo pipefail

REPO_ROOT="/Users/luisploennig/Colosseum/hfsp-labs-colosseum"
VPS_IP="72.62.239.63"
VPS_USER="root"
MAC_TAILSCALE="100.69.110.94"
MIGRATION_DIR="$HOME/migration"
TUNNEL_NAME="clawdrop-live"

B="\033[1m"; R="\033[0m"; GR="\033[92m"; YL="\033[93m"; RD="\033[91m"; CY="\033[96m"
ok()   { printf "  ${GR}✅  $1${R}\n"; }
warn() { printf "  ${YL}⚠️   $1${R}\n"; }
fail() { printf "  ${RD}❌  $1${R}\n"; }
info() { printf "  ${CY}→   $1${R}\n"; }
hr()   { printf "\n${CY}${B}─────────────────────────────────────────────────────────${R}\n"; }

STEP="${1:-all}"

# ─── STEP 1: SSH into VPS and export data ─────────────────────────────────────

step_ssh_export() {
  hr
  printf "\n${B}${CY}  STEP 1: Export data from piercalito VPS${R}\n\n"

  mkdir -p "$MIGRATION_DIR"

  # Try SSH hop via KVM4 (187.124.173.69)
  info "Attempting SSH hop: kimi key → KVM4 → piercalito..."

  if ssh -i ~/.ssh/id_ed25519_kimi \
        -o ConnectTimeout=10 \
        -o StrictHostKeyChecking=no \
        root@187.124.173.69 \
        "ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_IP} 'echo VPS_OK'" 2>/dev/null | grep -q "VPS_OK"; then
    ok "SSH hop via KVM4 works"

    # Export databases
    info "Exporting VPS databases..."
    ssh -i ~/.ssh/id_ed25519_kimi \
        -o StrictHostKeyChecking=no \
        root@187.124.173.69 \
        "ssh -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_IP} \
          'tar czf /tmp/clawdrop-data.tar.gz /opt/hfsp-labs/data/ 2>/dev/null || true && \
           ls -lh /tmp/clawdrop-data.tar.gz'" 2>/dev/null || warn "Data dir may be empty"

    # Export secrets
    info "Exporting VPS secrets..."
    ssh -i ~/.ssh/id_ed25519_kimi \
        -o StrictHostKeyChecking=no \
        root@187.124.173.69 \
        "ssh -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_IP} \
          'tar czf /tmp/clawdrop-secrets.tar.gz /home/hfsp2/.openclaw/secrets/ 2>/dev/null || true && \
           ls -lh /tmp/clawdrop-secrets.tar.gz 2>/dev/null || echo no_secrets'" 2>/dev/null || true

    # Export .env files from VPS
    info "Dumping VPS environment files..."
    ssh -i ~/.ssh/id_ed25519_kimi \
        -o StrictHostKeyChecking=no \
        root@187.124.173.69 \
        "ssh -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_IP} \
          'cat /opt/hfsp-labs/packages/trial-api/.env 2>/dev/null || true && \
           echo \"---PLATFORM---\" && \
           cat /opt/hfsp-labs/packages/clawdrop-platform/.env 2>/dev/null || true && \
           echo \"---ENV-PLATFORM---\" && \
           cat /opt/hfsp-labs/.env.platform 2>/dev/null || true'" 2>/dev/null \
        > "$MIGRATION_DIR/vps-envs.txt" && ok "Saved VPS env files → $MIGRATION_DIR/vps-envs.txt" \
        || warn "Could not dump VPS env files (check manually)"

    # Download the archives via SCP through KVM4 hop
    info "Downloading data archive via KVM4..."
    # Note: Direct scp through hop requires ProxyJump
    scp -i ~/.ssh/id_ed25519_kimi \
        -o ProxyJump="root@187.124.173.69" \
        -o StrictHostKeyChecking=no \
        "${VPS_USER}@${VPS_IP}:/tmp/clawdrop-data.tar.gz" \
        "$MIGRATION_DIR/" 2>/dev/null && ok "Downloaded clawdrop-data.tar.gz" \
        || warn "SCP failed — try manually: see ProxyJump example below"

    scp -i ~/.ssh/id_ed25519_kimi \
        -o ProxyJump="root@187.124.173.69" \
        -o StrictHostKeyChecking=no \
        "${VPS_USER}@${VPS_IP}:/tmp/clawdrop-secrets.tar.gz" \
        "$MIGRATION_DIR/" 2>/dev/null && ok "Downloaded clawdrop-secrets.tar.gz" \
        || warn "Secrets archive not found or empty"

    # Show VPS pm2 list
    info "Current VPS pm2 status:"
    ssh -i ~/.ssh/id_ed25519_kimi \
        -o StrictHostKeyChecking=no \
        root@187.124.173.69 \
        "ssh -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_IP} 'pm2 list'" 2>/dev/null || warn "pm2 not responding"

    # Show VPS docker
    info "Current VPS Docker containers:"
    ssh -i ~/.ssh/id_ed25519_kimi \
        -o StrictHostKeyChecking=no \
        root@187.124.173.69 \
        "ssh -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_IP} 'docker ps -a'" 2>/dev/null || warn "Docker not responding"

  else
    fail "SSH hop via KVM4 failed"
    warn "Manual steps required:"
    info "Option A: Try direct SSH if mac-local key is accessible:"
    info "  ssh -i /path/to/mac-local-id_rsa root@${VPS_IP}"
    info "Option B: Use Hostinger console at hpanel.hostinger.com"
    info "  VPS ID: 1313715 → Browser SSH → run export commands"
    info "Option C: Use Hostinger API to get VNC access:"
    info "  curl -X POST https://api.hostinger.com/v1/vps/1313715/restart \\"
    info "    -H 'Authorization: Bearer 9L8MHqOGJ0ryhiD9SyDIzKkgSgtGfN8x7RlNo7fN1fc23c37'"
    info ""
    info "After getting access, run on VPS:"
    info "  tar czf /tmp/clawdrop-data.tar.gz /opt/hfsp-labs/data/ 2>/dev/null || true"
    info "  tar czf /tmp/clawdrop-secrets.tar.gz /home/hfsp2/.openclaw/secrets/ 2>/dev/null || true"
    info "  cat /opt/hfsp-labs/packages/trial-api/.env"
    info "  cat /opt/hfsp-labs/packages/clawdrop-platform/.env"
    info ""
    info "Then download to Mac Mini:"
    info "  mkdir -p ~/migration"
    info "  scp root@${VPS_IP}:/tmp/clawdrop-data.tar.gz ~/migration/"
    info "  scp root@${VPS_IP}:/tmp/clawdrop-secrets.tar.gz ~/migration/"
  fi
}

# ─── STEP 2: Set up Cloudflare Tunnel ─────────────────────────────────────────

step_tunnel() {
  hr
  printf "\n${B}${CY}  STEP 2: Cloudflare Tunnel for clawdrop.live${R}\n\n"

  if ! command -v cloudflared &>/dev/null; then
    fail "cloudflared not found. Install with: brew install cloudflared"
    return 1
  fi

  # Check if tunnel already exists
  if cloudflared tunnel list 2>/dev/null | grep -q "$TUNNEL_NAME"; then
    ok "Tunnel '$TUNNEL_NAME' already exists"
    TUNNEL_UUID=$(cloudflared tunnel list 2>/dev/null | grep "$TUNNEL_NAME" | awk '{print $1}')
    info "Tunnel UUID: $TUNNEL_UUID"
  else
    info "Creating tunnel: $TUNNEL_NAME"
    cloudflared tunnel create "$TUNNEL_NAME"
    TUNNEL_UUID=$(cloudflared tunnel list 2>/dev/null | grep "$TUNNEL_NAME" | awk '{print $1}')
    ok "Tunnel created: $TUNNEL_UUID"
  fi

  # Generate config from template
  CLOUDFLARED_DIR="$HOME/.cloudflared"
  CONFIG_FILE="$CLOUDFLARED_DIR/config.yml"

  if [ -f "$CONFIG_FILE" ]; then
    info "Backing up existing config.yml → config.yml.bak"
    cp "$CONFIG_FILE" "${CONFIG_FILE}.bak"
  fi

  info "Writing cloudflared config.yml..."
  cat > "$CONFIG_FILE" << EOF
# Combined Cloudflare Tunnel config
# Tunnel: clawdrop-live (clawdrop.live)
# Generated by migrate-to-mac-mini.sh

tunnel: ${TUNNEL_UUID}
credentials-file: ${CLOUDFLARED_DIR}/${TUNNEL_UUID}.json

ingress:
  # Platform API — must come before /api/ generic rule
  - hostname: clawdrop.live
    path: /api/platform/.*
    service: http://localhost:8788

  # Trial API — SSE streaming chat endpoint
  - hostname: clawdrop.live
    path: /api/chat
    service: http://localhost:8787

  # Trial API — health, quota, and other /api/ routes
  - hostname: clawdrop.live
    path: /api/.*
    service: http://localhost:8787

  # Trial chatbot frontend
  - hostname: clawdrop.live
    path: /try.*
    service: http://localhost:3000

  # Dashboard (same frontend, different route)
  - hostname: clawdrop.live
    path: /dashboard.*
    service: http://localhost:3000

  # www redirect → apex
  - hostname: www.clawdrop.live
    service: http://localhost:3000

  # Catch-all: landing page
  - hostname: clawdrop.live
    service: http://localhost:3000

  # Required catch-all 404 at end of ingress rules
  - service: http_status:404
EOF

  ok "Config written to $CONFIG_FILE"

  # Route DNS
  info "Routing DNS for clawdrop.live → $TUNNEL_NAME..."
  cloudflared tunnel route dns "$TUNNEL_NAME" clawdrop.live 2>/dev/null && ok "DNS routed: clawdrop.live" || warn "DNS routing failed — may already be routed or need Cloudflare zone access"
  cloudflared tunnel route dns "$TUNNEL_NAME" www.clawdrop.live 2>/dev/null && ok "DNS routed: www.clawdrop.live" || warn "www routing failed"

  # Install as launchd service (macOS)
  info "Installing cloudflared as launchd service..."
  sudo cloudflared service install 2>/dev/null && ok "launchd service installed" || warn "Service install failed — run: sudo cloudflared service install"

  info "Starting tunnel..."
  sudo launchctl start com.cloudflare.cloudflared 2>/dev/null || cloudflared tunnel run "$TUNNEL_NAME" &
  ok "Tunnel started"

  # If oobe-bounty tunnel exists in old config backup, merge it
  if grep -q "oobe-bounty" "${CONFIG_FILE}.bak" 2>/dev/null; then
    warn "Old config had oobe-bounty routes — check ${CONFIG_FILE}.bak and merge manually if needed"
    info "The oobe-bounty routes should be in a separate tunnel config or added above the clawdrop.live rules"
  fi
}

# ─── STEP 3: Start PM2 services on Mac Mini ────────────────────────────────────

step_pm2() {
  hr
  printf "\n${B}${CY}  STEP 3: Start services with PM2${R}\n\n"

  cd "$REPO_ROOT"

  if ! command -v pm2 &>/dev/null; then
    info "Installing PM2 globally..."
    npm install -g pm2
  fi

  # Create logs dir
  mkdir -p "$REPO_ROOT/logs"
  mkdir -p "$REPO_ROOT/data"

  info "Building project..."
  npm run build 2>/dev/null && ok "Build succeeded" || warn "Build had errors — check output above"

  info "Starting services with PM2..."
  pm2 start "$REPO_ROOT/mac-mini-ecosystem.config.json" --env production 2>/dev/null \
    || pm2 restart "$REPO_ROOT/mac-mini-ecosystem.config.json" 2>/dev/null \
    || fail "PM2 start failed — check that dist/ files exist (npm run build)"

  pm2 save
  ok "PM2 services started"
  pm2 list
}

# ─── STEP 4: Verify ───────────────────────────────────────────────────────────

step_verify() {
  hr
  printf "\n${B}${CY}  STEP 4: Verify services${R}\n\n"

  check_endpoint() {
    local label="$1"
    local url="$2"
    if curl -sf --max-time 5 "$url" -o /dev/null 2>/dev/null; then
      ok "$label → $url"
    else
      fail "$label → $url (not responding)"
    fi
  }

  check_endpoint "trial-api health"      "http://localhost:8787/api/health"
  check_endpoint "clawdrop-platform"     "http://localhost:8788/api/health"
  check_endpoint "trial-frontend"        "http://localhost:3000"
  check_endpoint "clawdrop.live (tunnel)" "https://clawdrop.live/api/health"
  check_endpoint "clawdrop.live (www)"   "https://www.clawdrop.live"

  printf "\n"
  info "PM2 status:"
  pm2 list 2>/dev/null || warn "PM2 not running"

  printf "\n"
  info "Cloudflare tunnel status:"
  cloudflared tunnel list 2>/dev/null || warn "cloudflared not found"

  hr
  printf "\n${B}${GR}  Migration complete! Next steps:${R}\n\n"
  info "1. Populate secrets in .env.platform (check ~/migration/vps-envs.txt if exported)"
  info "2. If ~/migration/clawdrop-data.tar.gz exists: tar xzf ~/migration/clawdrop-data.tar.gz -C $REPO_ROOT/data/"
  info "3. Verify clawdrop.live is routing correctly in browser"
  info "4. Manually cancel piercalito VPS at hpanel.hostinger.com before May 31 2026"
  info "5. DNS: after VPS is confirmed down, remove any A records pointing to 72.62.239.63"
  printf "\n"
}

# ─── MAIN ─────────────────────────────────────────────────────────────────────

case "$STEP" in
  ssh-export) step_ssh_export ;;
  tunnel)     step_tunnel ;;
  pm2)        step_pm2 ;;
  verify)     step_verify ;;
  all)
    step_ssh_export
    step_tunnel
    step_pm2
    step_verify
    ;;
  *)
    printf "Usage: bash scripts/migrate-to-mac-mini.sh [ssh-export|tunnel|pm2|verify|all]\n"
    exit 1
    ;;
esac
