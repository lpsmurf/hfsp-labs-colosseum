# Trial App Deployment Guide

Complete guide for deploying the Clawdrop trial (Poly chat demo) to production and testing locally.

## 📋 Components

- **Backend**: `packages/trial-api/` — Express + Mastra Agent + Solana tools
- **Frontend**: `packages/trial-frontend/` — React Vite app with Chatbox UI
- **Nginx**: `config/nginx/conf.d/trial.conf` — Production routing config

## 🏠 Local Development

### Run locally (no Docker)

```bash
# Terminal 1: Backend on :8787
cd packages/trial-api
npm install
npm run dev

# Terminal 2: Frontend on :3000
cd packages/trial-frontend
npm install
npm run dev

# Test: http://localhost:3000/try
```

### Run with Docker (production-like)

```bash
# Build and run full stack
docker-compose -f docker-compose.trial.yml up --build

# Services will be available at:
# - Frontend: http://localhost:3000
# - Backend: http://localhost:8787/api/health
```

### Environment Configuration

Create `.env.trial` in `packages/trial-api/`:

```env
OPENROUTER_API_KEY=sk-or-v1-...
HELIUS_API_KEY=your-helius-api-key
PORT=8787
NODE_ENV=production
TRIAL_MESSAGES_PER_IP_PER_DAY=10
TRIAL_DAILY_BUDGET_USD=50
TRUST_PROXY=1
```

Or copy from `.env.example`:

```bash
cp packages/trial-api/.env.example .env.trial
# Edit with your API keys
```

## 🚀 Production Deployment (clawdrop.live)

### Prerequisites

- VPS running Linux (Ubuntu 20.04+)
- Nginx installed
- SSL certificate for clawdrop.live (from Let's Encrypt)
- Node.js 20+ installed
- OPENROUTER_API_KEY and HELIUS_API_KEY configured

### Deployment Steps

#### 1. Clone Repository

```bash
ssh root@72.62.239.63
cd /srv
git clone https://github.com/lpsmurf/hfsp-labs-colosseum.git colosseum
cd colosseum
```

#### 2. Setup Backend

```bash
cd packages/trial-api

# Install dependencies
npm ci --production

# Create .env for production
cat > .env << 'ENVEOF'
OPENROUTER_API_KEY=sk-or-v1-...
HELIUS_API_KEY=...
PORT=8787
NODE_ENV=production
TRIAL_MESSAGES_PER_IP_PER_DAY=10
TRIAL_DAILY_BUDGET_USD=50
TRUST_PROXY=1
ENVEOF

# Build
npm run build

# Start with PM2 (or systemd)
pm2 start dist/server.js --name "trial-api"
pm2 save
```

#### 3. Setup Frontend

```bash
cd packages/trial-frontend

# Install and build
npm ci --production
npm run build

# Serve with Node or nginx
pm2 serve dist 3000 --spa --name "trial-frontend"
pm2 save
```

Or use nginx to serve static files:

```nginx
location /try {
    root /srv/colosseum/packages/trial-frontend/dist;
    try_files $uri $uri/ /index.html;
}
```

#### 4. Configure Nginx

Update `/etc/nginx/nginx.conf`:

```nginx
http {
    include /etc/nginx/conf.d/*.conf;
    include /srv/colosseum/config/nginx/conf.d/trial.conf;
}
```

Reload:

```bash
nginx -s reload
```

#### 5. Verify Deployment

```bash
# Health check
curl https://clawdrop.live/api/health

# Should return:
# {"status":"ok","version":"0.1.0","budget_remaining":50}

# Test quota endpoint
curl 'https://clawdrop.live/api/quota?ip=192.168.1.1'

# Should return:
# {"used":0,"limit":10,"resets_at":"2026-05-05T23:59:59Z"}
```

## 🧪 Testing

### E2E Test (after deployment)

```bash
bash scripts/test-trial-e2e.sh https://clawdrop.live
```

Expected output:

```
🧪 Testing Trial App E2E at https://clawdrop.live

1️⃣  Health check...
   ✅ Health: {"status":"ok","version":"0.1.0","budget_remaining":50}

2️⃣  Quota check...
   ✅ Quota: {"used":0,"limit":10,"resets_at":"2026-05-05T23:59:59Z"}

3️⃣  Testing /api/chat SSE stream...
   Sending: 'what is the price of SOL'
   ✅ Received 42 text chunks
   ✅ Stream completed properly
   ✅ SOL price data detected in response

🎉 E2E Tests Complete!
```

### Manual Browser Testing

1. Open https://clawdrop.live/try
2. Type: "what is the price of SOL"
3. Watch SSE stream in real-time
4. Send 11 messages to trigger paywall
5. Verify Phantom wallet button appears

## 🔍 Troubleshooting

### Backend not responding

```bash
# Check if running
curl http://localhost:8787/api/health

# Check logs
pm2 logs trial-api

# Verify env vars
cat .env | grep OPENROUTER
```

### Frontend blank page

```bash
# Check if built
ls packages/trial-frontend/dist

# Check nginx logs
tail -f /var/log/nginx/error.log

# Rebuild if needed
cd packages/trial-frontend && npm run build
```

### SSE streaming choppy

- Ensure `proxy_buffering off` in nginx
- Ensure `X-Accel-Buffering: no` header is set
- Check proxy timeout values (should be 300s+)

See `config/nginx/conf.d/trial.conf` for correct settings.

## 📊 Monitoring

### Check rates and budget

```bash
# On VPS, query the SQLite database
cd packages/trial-api/data
sqlite3 quota.sqlite "SELECT * FROM quotas LIMIT 5;"
sqlite3 quota.sqlite "SELECT * FROM spend LIMIT 5;"
```

### Daily reset

- IP quotas reset at **UTC midnight** (00:00 UTC)
- Budget resets at **UTC midnight** (00:00 UTC)

## 🔐 Security Notes

- Keep API keys in .env, never commit them
- Use strong SSL certificates (Let's Encrypt recommended)
- Enable rate limiting in nginx (already configured in trial.conf)
- Monitor daily budget to prevent unexpected costs
- Log all requests for audit trail

## 📝 Logs

### Backend logs

```bash
pm2 logs trial-api
pm2 logs trial-frontend
```

### Nginx logs

```bash
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

## ✅ Pre-Launch Checklist

- [ ] Backend starts without errors
- [ ] Frontend builds to dist/
- [ ] `/api/health` returns 200
- [ ] `/api/chat` streams SSE (60+ chunks)
- [ ] `/api/quota` returns correct format
- [ ] Nginx includes trial.conf
- [ ] `/try` loads chatbox UI
- [ ] Chat sends message via SSE
- [ ] Tools execute and return data
- [ ] Paywall triggers at message 11
- [ ] Budget tracking works
- [ ] Rate limiting blocks at 10 msgs/day

---

**Questions?** Check WORKLOG.md for agent status or PR #5 for implementation details.
