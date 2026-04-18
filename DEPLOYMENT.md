# HFSP Labs Monorepo - Production Deployment

## Quick Start (pm2)

```bash
# Install pm2 globally
npm install -g pm2

# Start all services
pm2 start ecosystem.config.json

# View logs
pm2 logs

# Restart all
pm2 restart all

# Stop all
pm2 stop all
```

## Docker Compose

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| clawdrop-mcp | 3000 | MCP Server + API |
| storefront-bot | 3001 | Telegram bot + provisioning |
| clawdrop-wizard | 3003 | Setup wizard |

## Environment Setup

```bash
# Create env files
cp packages/clawdrop-mcp/.env.example packages/clawdrop-mcp/.env.local
cp packages/agent-provisioning/.env.example packages/agent-provisioning/.env.local

# Edit with your keys
nano packages/clawdrop-mcp/.env.local
nano packages/agent-provisioning/.env.local
```

## Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure real API keys (no test/demo keys)
- [ ] Set up SSL/TLS termination (nginx/caddy)
- [ ] Configure firewall (ufw allow 3000 3001 3003)
- [ ] Set up log rotation
- [ ] Configure backup for data/
- [ ] Monitor with pm2 monit or docker health checks

## Troubleshooting

**Service won't start:**
```bash
pm2 logs <service-name>
# or
docker-compose logs <service-name>
```

**Port already in use:**
```bash
lsof -i :3000
kill -9 <PID>
```

**Rebuild after code changes:**
```bash
npm run build
pm2 restart all
```
