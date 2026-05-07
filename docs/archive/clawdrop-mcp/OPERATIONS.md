# HFSP Provisioning Engine - Operations Runbook

## Quick Commands

### Check Status
```bash
docker compose -f docker-compose.prod.yml ps
docker logs -f hfsp-provisioning-engine --tail 100
```

### Health Check
```bash
curl http://localhost:3000/health | jq .
```

### Restart Service
```bash
docker compose -f docker-compose.prod.yml restart hfsp-provisioning-engine
```

### Stop Service
```bash
docker compose -f docker-compose.prod.yml down
```

### View Logs
```bash
# Last 50 lines
docker logs hfsp-provisioning-engine -n 50

# Follow logs
docker logs -f hfsp-provisioning-engine

# By time
docker logs --since 10m hfsp-provisioning-engine
```

## Backup & Recovery

### Manual Backup
```bash
./backup-database.sh
```

### Restore from Backup
```bash
# Extract backup
gunzip /data/hfsp/backups/agents.db.20260423_020000.backup.gz

# Copy into container
CONTAINER_ID=$(docker ps --filter "name=hfsp-provisioning-engine" --quiet)
docker cp /data/hfsp/backups/agents.db.20260423_020000.backup \
  "$CONTAINER_ID:/app/data/agents.db"

# Restart
docker compose -f docker-compose.prod.yml restart hfsp-provisioning-engine
```

## Monitoring Setup

### Telegram Alerts

1. **Create a Telegram bot** (if not already done):
   - Message @BotFather on Telegram
   - Create a new bot, get the TOKEN

2. **Get your Chat ID**:
   ```bash
   curl https://api.telegram.org/bot{TOKEN}/getMe
   ```

3. **Set environment variables**:
   ```bash
   export TELEGRAM_BOT_TOKEN="your_bot_token"
   export TELEGRAM_CHAT_ID="your_chat_id"
   ```

4. **Set up cron job** (runs every 5 minutes):
   ```bash
   (crontab -l; echo "*/5 * * * * TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID=$TELEGRAM_CHAT_ID /path/to/health-monitor.sh") | crontab -
   ```

5. **Set up daily backups**:
   ```bash
   (crontab -l; echo "0 2 * * * /path/to/backup-database.sh") | crontab -
   ```

## Common Issues

### Port 3000 Already in Use
```bash
# Kill existing process
lsof -i :3000 | grep LISTEN | awk '{print $2}' | xargs kill -9

# Or use a different port in docker-compose.prod.yml
```

### Database Corrupted
```bash
# Restore from backup (see above)
# Or delete the database (fresh start)
docker compose -f docker-compose.prod.yml down -v
docker compose -f docker-compose.prod.yml up -d
```

### High Memory Usage
- Check logs for memory leaks: `docker stats hfsp-provisioning-engine`
- Restart container: `docker compose -f docker-compose.prod.yml restart`
- Increase memory limit in docker-compose.prod.yml

### Telegram Webhook Not Working
1. Verify webhook URL in `.env.production`
2. Check if webhook is actually being called: `docker logs | grep webhook`
3. Verify Telegram bot token is valid
4. Check firewall/network allows incoming webhook traffic

## Scaling

### Multiple Instances (with load balancer)
```bash
docker compose -f docker-compose.prod.yml up -d --scale hfsp-provisioning-engine=3
```

Requires:
- External volume shared between containers
- Load balancer (nginx, HAProxy, AWS ALB)
- Session affinity for persistent connections

## Maintenance Windows

### Rolling Restart
```bash
docker compose -f docker-compose.prod.yml up -d --no-deps --build
```

### Update Configuration
1. Edit `.env.production`
2. Restart: `docker compose -f docker-compose.prod.yml restart`

### View Current Configuration
```bash
docker exec hfsp-provisioning-engine env | grep -E "WALLET|JWT|HELIUS"
```

## Disaster Recovery

### Full Service Recovery
1. Ensure Docker volumes are intact
2. Rebuild image: `docker build -t hfsp-provisioning-engine:latest .`
3. Deploy: `docker compose -f docker-compose.prod.yml up -d`
4. Verify: `curl http://localhost:3000/health`

### Data Loss Prevention
- Daily automated backups to `/data/hfsp/backups/`
- Keep backups for minimum 7 days
- Consider S3 backup for redundancy (future improvement)

## Performance Monitoring

### Key Metrics to Watch
```bash
# CPU/Memory usage
docker stats hfsp-provisioning-engine

# Request latency
curl -w "Response time: %{time_total}s\n" http://localhost:3000/health

# Database size
docker exec hfsp-provisioning-engine du -sh /app/data/agents.db
```

## Support & Escalation

1. **Check logs first**: `docker logs hfsp-provisioning-engine`
2. **Verify health**: `curl http://localhost:3000/health`
3. **Check resources**: `docker stats hfsp-provisioning-engine`
4. **Restart if needed**: `docker compose -f docker-compose.prod.yml restart`
5. **Escalate to on-call** if still failing after restart
