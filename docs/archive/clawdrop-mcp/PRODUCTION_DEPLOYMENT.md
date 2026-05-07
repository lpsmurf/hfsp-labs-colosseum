# HFSP Provisioning Engine - Production Deployment Guide

## Overview
This guide covers deploying the Clawdrop MCP deployment service to production.

## Pre-Deployment Checklist

- [ ] **Environment Variables**: Copy `.env.production.template` to `.env.production` and fill in all production credentials
- [ ] **Solana RPC**: Verify Helius API key and RPC endpoint are configured for mainnet
- [ ] **Payment Wallets**: Confirm receiving and fee wallet addresses are correct
- [ ] **JWT Keys**: Generate JWT private/public keys using `openssl rand -hex 32`
- [ ] **Webhook Secret**: Generate HMAC secret for Telegram webhook validation
- [ ] **Database**: Ensure SQLite database directory is writable and backed up
- [ ] **Health Checks**: Verify all health check endpoints respond correctly

## Deployment Steps

### 1. Build Docker Image

```bash
# From the clawdrop-mcp directory
docker build -t hfsp-provisioning-engine:latest .

# Tag for registry
docker tag hfsp-provisioning-engine:latest your-registry/hfsp-provisioning-engine:latest
docker push your-registry/hfsp-provisioning-engine:latest
```

### 2. Deploy to Production

**Option A: Docker Compose**

```bash
docker-compose -f docker-compose.prod.yml up -d
```

**Option B: Kubernetes**

```bash
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
```

**Option C: Manual Docker**

```bash
docker run -d \
  --name hfsp-provisioning-engine \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file .env.production \
  -v /data/hfsp:/app/data \
  hfsp-provisioning-engine:latest
```

### 3. Verify Health

```bash
# Check service health
curl http://localhost:3000/health

# Expected response:
# {"status":"healthy","service":"deployment-api","timestamp":"2026-04-23T..."}
```

### 4. Run Smoke Tests

```bash
npm run test:smoke

# Tests should verify:
# ✓ Missing Telegram token validation
# ✓ Invalid token format rejection
# ✓ Valid token accepts deployment
# ✓ Idempotency prevents duplicates
# ✓ Service health check responds
```

### 5. Monitor Logs

```bash
# Docker logs
docker logs -f hfsp-provisioning-engine

# Key metrics to monitor:
# - Deployment requests per hour
# - Payment processing success rate
# - Error rate and error types
# - Response time percentiles (p50, p95, p99)
```

## Production Configuration

### Solana RPC Failover Chain
1. Helius API (Primary)
2. api.mainnet-beta.solana.com (Secondary)
3. solana-api.projectserum.com (Tertiary)

Each RPC has 5-second timeout and 3 retry attempts with exponential backoff.

### Database Backups
- Daily backup to S3: `s3://your-backup-bucket/hfsp/agents.db.$(date +%Y%m%d).backup`
- WAL (Write-Ahead Logging) enabled for crash safety
- Foreign key constraints enabled

### Rate Limiting
- 100 requests per minute per IP address
- 10 concurrent deployments maximum
- Payment processing queued with 30-second timeout

### Monitoring & Alerts

**Critical Alerts** (page on-call):
- Service down (health check fails)
- Payment processing failures > 5% error rate
- Database errors or connection pool exhaustion
- Telegram API integration failures

**Warning Alerts** (create ticket):
- Response time P95 > 2 seconds
- Deployment queue depth > 10
- Solana RPC failover in progress

## Rollback Procedure

If issues occur after deployment:

```bash
# Stop current deployment
docker stop hfsp-provisioning-engine
docker rm hfsp-provisioning-engine

# Redeploy previous version
docker run -d \
  --name hfsp-provisioning-engine \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file .env.production \
  -v /data/hfsp:/app/data \
  hfsp-provisioning-engine:previous-tag
```

## Production Access

### API Endpoints

**Health Check** (Public)
```
GET /health
```

**Deployment API** (Protected by JWT)
```
POST /api/v1/deploy_agent
X-API-Key: <JWT_TOKEN>

Request:
{
  "telegram_token": "123456789:ABCdefGHIjklmnoPQRstuvWXYZ",
  "agent_id": "agent_uuid",
  "agent_name": "MyAgent",
  "tier_id": "tier_uuid",
  "wallet_address": "solana_wallet"
}

Response:
{
  "success": true,
  "deployment_id": "deploy_uuid",
  "status": "deploying"
}
```

## Monitoring Dashboard

Key metrics to track:
- Deployments per day
- Average deployment time
- Payment success rate
- Error rate by type
- Solana RPC endpoint selection distribution
- Database transaction latency

## Support & Escalation

- **Deployment Issues**: Check logs, verify wallet balance, check Solana RPC status
- **Payment Processing**: Check Solana network status, verify wallet configuration
- **Telegram Integration**: Verify token format, check Telegram API availability
- **Critical Incident**: Contact platform oncall

