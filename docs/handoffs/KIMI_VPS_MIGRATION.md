# Kimi — VPS Migration to Mac Mini

**From:** Claude (orchestrator)  
**Date:** 2026-05-26  
**Priority:** HIGH — cancelling 3 VPS servers saves ~$85/mo  
**Mac Mini:** Ready and standing by (get IP/SSH details from the user before starting)

---

## Current Infrastructure Map

| Server | IP | Role | Cost | Action |
|--------|----|------|------|--------|
| piercalito | `72.62.239.63` | Main: clawdrop.live platform, API, Telegram wizard | $17.99/mo | KEEP |
| claude.clawdrop.live | `187.124.170.113` | SSE/MCP nginx proxy → port 3000, clawdrop-mcp container | $8.99/mo | KEEP |
| KVM4 | `187.124.173.69` | Single tenant container (`hfsp_t_momyf1uw_ogqypv`), openclaw-runtime:stable | $42.99/mo | CANCEL after migration |
| OpenClaw VPS | `187.124.174.137` | OpenClaw gateway (Kimi's work), Codex OAuth expired | $24.49/mo | CANCEL after migration |
| Empty KVM2 | `76.13.157.84` | Wiped/fresh Ubuntu, nothing running | $17.99/mo | CANCEL immediately |

**SSH access:**
```bash
# piercalito
ssh -i ~/.ssh/id_rsa root@72.62.239.63

# KVM4 (hop via piercalito)
ssh -i /root/.ssh/id_ed25519_hfsp_provisioner root@187.124.173.69

# OpenClaw VPS (hop via piercalito hfsp user)
ssh root@72.62.239.63 -t "ssh -i /home/hfsp/.ssh/id_ed25519 root@187.124.174.137"

# claude.clawdrop.live
ssh -i ~/.ssh/id_rsa root@187.124.170.113

# Empty KVM2
ssh -i ~/.ssh/id_rsa root@76.13.157.84
```

---

## What Moves to Mac Mini

Everything currently on the 3 servers being cancelled:

1. **Tenant container** (`hfsp_t_momyf1uw_ogqypv`) from KVM4 — the lone deployed agent
2. **OpenClaw gateway** from OpenClaw VPS — the agent runtime gateway (your previous handoff)
3. **Future tenant containers** — Mac Mini becomes the new per-user Docker host

The 2 Hostinger VPS servers we're keeping (piercalito + claude.clawdrop.live) **stay unchanged.**

---

## Step 1 — Verify Empty KVM2 Has Nothing (Cancel First)

```bash
ssh -i ~/.ssh/id_rsa root@76.13.157.84 "docker ps -a; ls /home; pm2 list 2>/dev/null || true"
```

If output is empty/clean → cancel via Hostinger dashboard immediately. No migration needed.

---

## Step 2 — Audit KVM4 Tenant Container

```bash
ssh -i /root/.ssh/id_ed25519_hfsp_provisioner root@187.124.173.69 << 'ENDSSH'
docker ps -a
docker inspect hfsp_t_momyf1uw_ogqypv 2>/dev/null | jq '.[0].Config.Env | map(select(startswith("TELEGRAM") or startswith("OPENROUTER") or startswith("SOLANA") or startswith("WALLET")))'
docker volume ls
pm2 list 2>/dev/null || true
ENDSSH
```

Record the env vars — you'll need them to re-create the container on Mac Mini.

---

## Step 3 — Export Tenant Container State

On KVM4:
```bash
# Export the container image
docker commit hfsp_t_momyf1uw_ogqypv openclaw-runtime:tenant-backup
docker save openclaw-runtime:tenant-backup | gzip > /tmp/tenant-backup.tar.gz

# Export any volumes
docker inspect hfsp_t_momyf1uw_ogqypv --format '{{range .Mounts}}{{.Name}} {{end}}'
# For each named volume:
docker run --rm -v <VOLUME_NAME>:/data -v /tmp:/backup alpine tar czf /backup/<VOLUME_NAME>.tar.gz /data
```

Transfer to Mac Mini:
```bash
# From Mac Mini (fill in Mac Mini's local IP or use tailscale/VPN):
scp -i /root/.ssh/id_ed25519_hfsp_provisioner root@187.124.173.69:/tmp/tenant-backup.tar.gz ~/migration/
```

---

## Step 4 — Audit OpenClaw VPS

```bash
ssh root@72.62.239.63 -t "ssh -i /home/hfsp/.ssh/id_ed25519 root@187.124.174.137" << 'ENDSSH'
docker ps -a
pm2 list 2>/dev/null || true
ls /home/
cat /etc/nginx/sites-enabled/* 2>/dev/null || true
ENDSSH
```

Note which ports nginx is proxying and which services are active. The OpenClaw gateway was mid-build (per the last handoff — `kimi/openclaw-runtime-switch` branch) so check if it's actually running.

---

## Step 5 — Set Up Mac Mini as Docker Host

On Mac Mini:
```bash
# Install Docker (if not already)
curl -fsSL https://get.docker.com | sh

# Install PM2
npm install -g pm2

# Create migration directory
mkdir -p ~/clawdrop/tenants ~/clawdrop/volumes
```

Set up SSH access from piercalito → Mac Mini so the provisioner on piercalito can spawn containers here:
```bash
# On piercalito, add Mac Mini to known hosts and copy provisioner key
ssh-copy-id -i /root/.ssh/id_ed25519_hfsp_provisioner <MAC_MINI_USER>@<MAC_MINI_IP>
```

---

## Step 6 — Restore Tenant Container on Mac Mini

```bash
# On Mac Mini
docker load < ~/migration/tenant-backup.tar.gz

# Restore volumes
docker run --rm -v <VOLUME_NAME>:/data -v ~/migration:/backup alpine tar xzf /backup/<VOLUME_NAME>.tar.gz -C /

# Re-run container with original env vars (get from Step 2 output)
docker run -d \
  --name hfsp_t_momyf1uw_ogqypv \
  --restart unless-stopped \
  -e TELEGRAM_BOT_TOKEN=<from Step 2> \
  -e OPENROUTER_API_KEY=<from Step 2> \
  -e SOLANA_WALLET_PRIVATE_KEY=<from Step 2> \
  -v <VOLUME_NAME>:/data \
  openclaw-runtime:tenant-backup
```

Verify the Telegram bot for this tenant responds.

---

## Step 7 — Update Docker Deployer to Target Mac Mini

In `packages/clawdrop-platform/src/services/docker-deployer.ts` (or `packages/clawdrop-platform/src/agent/dockerService.ts`), update the Docker host target from KVM4's IP to Mac Mini's IP:

```typescript
// Change from (KVM4):
const docker = new Docker({ host: '187.124.173.69', port: 2376 });

// Change to (Mac Mini):
const docker = new Docker({ host: process.env.DOCKER_HOST_IP, port: 2376 });
```

Add `DOCKER_HOST_IP=<MAC_MINI_IP>` to `.env.platform` on piercalito.

---

## Step 8 — Verify Before Cancelling

Run these checks before hitting cancel on Hostinger:

```bash
# 1. Tenant Telegram bot still responds (manual — ask user to send /start)
# 2. New agent spawn works end-to-end
curl -X POST https://clawdrop.live/api/agent/spawn \
  -H "Content-Type: application/json" \
  -d '{"userId": "test", "tier": "basic"}' 

# 3. Confirm KVM4 container is stopped (don't run two copies)
ssh root@187.124.173.69 "docker stop hfsp_t_momyf1uw_ogqypv"

# 4. Confirm OpenClaw VPS services stopped
ssh root@187.124.174.137 "docker stop \$(docker ps -q) 2>/dev/null; pm2 stop all 2>/dev/null"
```

---

## Step 9 — Cancel Servers

Cancel in this order (safest first):

1. **Empty KVM2** (`76.13.157.84`) — cancel immediately, nothing there
2. **OpenClaw VPS** (`187.124.174.137`) — cancel after Step 8 confirms gateway migrated
3. **KVM4** (`187.124.173.69`) — cancel after tenant container confirmed running on Mac Mini

Cancel via Hostinger dashboard or API:
```bash
# Hostinger Account #1 API token: 9L8MHqOGJ0ryhiD9SyDIzKkgSgtGfN8x7RlNo7fN1fc23c37
# Hostinger Account #2 API token: 2cHNhnO2jExrRnw3iBIhHBDeJoK2xhH5snbcvSENb8e1a8ad
```

---

## Post-Migration Checklist

- [ ] clawdrop.live platform still up (piercalito unchanged)
- [ ] claude.clawdrop.live MCP proxy still up (unchanged)
- [ ] Tenant Telegram bot responsive
- [ ] New agent spawns route to Mac Mini Docker
- [ ] Empty KVM2 cancelled
- [ ] OpenClaw VPS cancelled
- [ ] KVM4 cancelled
- [ ] Monthly spend: $17.99 + $8.99 = ~$27/mo (was ~$112/mo)

---

## Notes

- **Do not cancel piercalito or claude.clawdrop.live** — they stay
- Mac Mini needs a static LAN IP or Tailscale address that piercalito can reach
- If Mac Mini is behind NAT, set up Tailscale on both Mac Mini and piercalito
- The OpenClaw runtime switch handoff (`kimi/openclaw-runtime-switch` branch) is a dependency — check if that work is complete before migrating the OpenClaw gateway
