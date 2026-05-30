# VPS — piercalito (srv1313715.hstgr.cloud)

Archived configuration for the Hostinger KVM 2 VPS that hosted clawdrop.live.

**VPS details:**
- Host: srv1313715.hstgr.cloud / 72.62.239.63
- Plan: KVM 2 (2 vCPU, 8 GB RAM, 100 GB SSD)
- OS: Ubuntu 24.04 LTS
- Cost: $17.99/mo — cancelled 2026-05-31
- Region: Data center 15

**Migrated to:** Mac Mini (Tailscale 100.69.110.94, LAN 192.168.178.72) on 2026-05-29

---

## Services That Ran on This VPS

| Service | Port | Process Manager | Notes |
|---------|------|-----------------|-------|
| Nginx (SSL proxy) | 80/443 | systemd | SSL for clawdrop.live via Let's Encrypt |
| trial-frontend | 3000 | PM2 | React/Vite build |
| clawdrop-mcp | 3000 | PM2 | MCP server |
| storefront-bot | 3001 | PM2 | Telegram storefront bot |
| clawdrop-wizard | 3003 | PM2 | Web wizard |
| trial-api | 8787 | PM2 | Trial chatbot backend |
| clawdrop-platform | 8788 | PM2 | Subscriptions + Docker orchestration |
| Docker daemon | — | systemd | Spawns per-user agent containers |

---

## Directory Layout on VPS

```
/opt/hfsp-labs/                   ← repo deploy root
  packages/
    clawdrop-mcp/
    agent-provisioning/
    trial-api/
    trial-frontend/
    clawdrop-platform/
  config/
    nginx/conf.d/trial.conf       ← nginx reverse proxy
    pm2/ecosystem.config.json     ← PM2 process list
  data/
    openclaw.sqlite               ← platform database (BACK UP BEFORE CANCEL)
  logs/

/etc/nginx/conf.d/                ← symlink or copy from repo
/etc/letsencrypt/                 ← Let's Encrypt certs (clawdrop.live)
/var/www/clawdrop/                ← static landing page files

/home/hfsp2/.openclaw/secrets/    ← bot tokens, API keys
  hfsp_agent_bot.token
  hfsp_db_secret
```

---

## DNS Records (Before Migration)

| Record | Type | Value |
|--------|------|-------|
| clawdrop.live | A | 72.62.239.63 |
| www.clawdrop.live | A | 72.62.239.63 |

After migration, these point to Mac Mini via Cloudflare Tunnel (no IP needed).

---

## SSH Access (Historical)

```bash
# Used MacBook Pro id_rsa (private key not on Mac Mini)
ssh -i ~/.ssh/id_rsa root@72.62.239.63

# Key registered on Hostinger: mac-local (id_rsa, MacBook Pro)
# Also: hfsp-provisioner-root (from KVM4 server)
```

---

## Re-provisioning a New VPS

To restore these services on a new VPS in the future, see:
- [scripts/setup-vps.sh](scripts/setup-vps.sh) — full setup from scratch
- [nginx/conf.d/clawdrop.conf](nginx/conf.d/clawdrop.conf) — nginx config
- [pm2/ecosystem.config.json](pm2/ecosystem.config.json) — PM2 process list
- [scripts/setup-ssl.sh](scripts/setup-ssl.sh) — Let's Encrypt cert setup

Run in order:
```bash
bash VPS/scripts/setup-vps.sh
# then update DNS A record to new VPS IP
bash VPS/scripts/setup-ssl.sh clawdrop.live admin@clawdrop.live
```
