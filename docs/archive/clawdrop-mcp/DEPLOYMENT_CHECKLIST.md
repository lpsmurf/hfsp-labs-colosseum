# P2 Production Deployment Checklist

## Pre-Deployment (1 hour before)

- [ ] **DNS**: Verify `api.hfsp.cloud` resolves correctly
- [ ] **Wallet**: Confirm SOL balance in both wallets
  ```bash
  solana balance 3TyBTeqqN5NpMicX6JXAVAHqUyYLqSNz4EMtQxM34yMw -u m
  ```
- [ ] **Storage**: Verify `/data/hfsp` directory exists and is writable
  ```bash
  mkdir -p /data/hfsp && touch /data/hfsp/test && rm /data/hfsp/test
  ```
- [ ] **Secrets**: Confirm `.env.production` is in place (not committed)
  ```bash
  ls -la .env.production && cat .env.production | head -5
  ```
- [ ] **Docker**: Verify image is built
  ```bash
  docker images | grep hfsp-provisioning-engine
  ```
- [ ] **Ports**: Confirm 3000 is available
  ```bash
  lsof -i :3000 || echo "Port free"
  ```

## Deployment (5 minutes)

- [ ] **Stage 1**: Start service
  ```bash
  docker compose -f docker-compose.prod.yml up -d
  sleep 5
  ```

- [ ] **Stage 2**: Verify health
  ```bash
  curl http://localhost:3000/health | jq .
  ```

- [ ] **Stage 3**: Check logs for errors
  ```bash
  docker logs hfsp-provisioning-engine | tail -30
  ```

- [ ] **Stage 4**: Verify container is healthy
  ```bash
  docker compose -f docker-compose.prod.yml ps
  ```

## Post-Deployment (15 minutes)

- [ ] **Health**: Check status endpoint
  ```bash
  curl -X GET http://localhost:3000/health
  ```

- [ ] **API**: Test deployment endpoint
  ```bash
  curl -X POST http://localhost:3000/api/v1/deploy_agent \
    -H "Content-Type: application/json" \
    -H "X-API-Key: $JWT_TOKEN" \
    -d '{
      "telegram_token": "test_token",
      "agent_id": "test_agent",
      "agent_name": "TestAgent",
      "tier_id": "tier_1",
      "wallet_address": "3TyBTeqqN5NpMicX6JXAVAHqUyYLqSNz4EMtQxM34yMw"
    }'
  ```

- [ ] **Database**: Verify database created
  ```bash
  docker exec hfsp-provisioning-engine ls -lh /app/data/agents.db
  ```

- [ ] **Monitoring**: Set up health checks
  ```bash
  # Run backup script manually
  ./backup-database.sh
  
  # Set up cron for backups
  (crontab -l; echo "0 2 * * * /path/to/packages/clawdrop-mcp/backup-database.sh") | crontab -
  ```

- [ ] **Alert**: Set up Telegram alerts
  ```bash
  export TELEGRAM_BOT_TOKEN="your_bot_token"
  export TELEGRAM_CHAT_ID="your_chat_id"
  (crontab -l; echo "*/5 * * * * TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID=$TELEGRAM_CHAT_ID /path/to/packages/clawdrop-mcp/health-monitor.sh") | crontab -
  ```

## Verification (optional, detailed checks)

- [ ] **RPC Connection**: Verify Solana RPC works
  ```bash
  docker logs hfsp-provisioning-engine | grep -i "helius\|rpc\|solana"
  ```

- [ ] **x402 Payments**: Check if x402 middleware is loaded
  ```bash
  docker logs hfsp-provisioning-engine | grep "x402\|payment"
  ```

- [ ] **MemPalace**: Verify MemPalace integration
  ```bash
  docker logs hfsp-provisioning-engine | grep -i "mempalace"
  ```

- [ ] **Database**: Check SQLite health
  ```bash
  docker exec hfsp-provisioning-engine sqlite3 /app/data/agents.db ".tables"
  ```

## Rollback (if needed)

If deployment fails at any stage:

```bash
# Stop the service
docker compose -f docker-compose.prod.yml down

# Verify it's stopped
docker ps | grep hfsp

# Check backups exist
ls -la /data/hfsp/backups/

# Redeploy if needed
docker compose -f docker-compose.prod.yml up -d
```

## Go/No-Go Decision

**GO Criteria** (ALL must be met):
- [ ] Health endpoint returns HTTP 200
- [ ] Container is running (not restarting)
- [ ] Logs show no ERROR or CRITICAL messages
- [ ] Database file created successfully
- [ ] Wallet addresses configured

**NO-GO Criteria** (if ANY are true):
- [ ] Port 3000 conflicts
- [ ] Health endpoint returns non-200
- [ ] Container repeatedly restarting
- [ ] Database file permission errors
- [ ] Insufficient wallet balance

## Sign-Off

- **Deployment Date**: _______________
- **Deployed By**: _______________
- **Status**: GO ☐  NO-GO ☐
- **Backup Confirmed**: ☐
- **Alert System Active**: ☐
