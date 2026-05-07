#!/bin/bash
# Quick deployment script for P2 production

set -e

echo "🚀 HFSP Provisioning Engine - P2 Production Deployment"
echo "======================================================="
echo ""

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check prerequisites
echo "📋 Checking prerequisites..."

# Check .env.production exists
if [ ! -f ".env.production" ]; then
  echo -e "${RED}✗ .env.production not found${NC}"
  exit 1
fi
echo -e "${GREEN}✓ .env.production exists${NC}"

# Check Docker
if ! command -v docker &> /dev/null; then
  echo -e "${RED}✗ Docker not found${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Docker available${NC}"

# Check if image exists
if ! docker images | grep -q "hfsp-provisioning-engine:latest"; then
  echo -e "${YELLOW}! Image not found, building...${NC}"
  docker build -t hfsp-provisioning-engine:latest . || exit 1
fi
echo -e "${GREEN}✓ Docker image ready${NC}"

# Check port
if lsof -i :3000 2>/dev/null | grep -q LISTEN; then
  echo -e "${YELLOW}⚠ Port 3000 already in use${NC}"
  echo "  Kill with: lsof -i :3000 | grep LISTEN | awk '{print \$2}' | xargs kill -9"
  exit 1
fi
echo -e "${GREEN}✓ Port 3000 available${NC}"

# Create data directory
mkdir -p /data/hfsp /data/hfsp/backups 2>/dev/null || true
echo -e "${GREEN}✓ Data directory ready${NC}"

echo ""
echo "🚀 Starting deployment..."
echo ""

# Start service
docker compose -f docker-compose.prod.yml down --volumes 2>/dev/null || true
docker compose -f docker-compose.prod.yml up -d

# Wait for container to be ready
echo "⏳ Waiting for service to be ready..."
for i in {1..30}; do
  if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    break
  fi
  echo -n "."
  sleep 1
done

echo ""
echo ""

# Verify health
if curl -s http://localhost:3000/health | jq . > /dev/null 2>&1; then
  HEALTH=$(curl -s http://localhost:3000/health | jq .)
  echo -e "${GREEN}✓ Service is healthy!${NC}"
  echo ""
  echo "Health Status:"
  echo "$HEALTH" | jq .
else
  echo -e "${RED}✗ Service failed health check${NC}"
  echo ""
  echo "Container logs:"
  docker logs hfsp-provisioning-engine | tail -20
  exit 1
fi

echo ""
echo "📊 Service Status:"
docker compose -f docker-compose.prod.yml ps

echo ""
echo -e "${GREEN}✅ Deployment successful!${NC}"
echo ""
echo "📝 Next steps:"
echo "  1. Monitor logs: docker logs -f hfsp-provisioning-engine"
echo "  2. Set up backups: (crontab -l; echo \"0 2 * * * /path/to/backup-database.sh\") | crontab -"
echo "  3. Set up alerts: export TELEGRAM_BOT_TOKEN=... && export TELEGRAM_CHAT_ID=... && health-monitor.sh"
echo ""
echo "🔗 Health endpoint: http://localhost:3000/health"
echo "📚 Runbook: ./OPERATIONS.md"
