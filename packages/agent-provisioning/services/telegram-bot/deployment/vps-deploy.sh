#!/bin/bash
# [KIMI] VPS deployment script for telegram-bot service
# Usage: ./deployment/vps-deploy.sh <server> <branch>
# Example: ./deployment/vps-deploy.sh deploy.example.com main

set -e

# Configuration
SERVER="${1:-your-vps-domain.com}"
BRANCH="${2:-main}"
SSH_USER="deploy"
APP_DIR="/var/www/telegram-bot"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "================================"
echo "Deploying telegram-bot to ${SERVER}"
echo "Branch: ${BRANCH}"
echo "================================"
echo ""

# Helper functions
error() {
  echo -e "${RED}ERROR: $1${NC}"
  exit 1
}

success() {
  echo -e "${GREEN}✓ $1${NC}"
}

info() {
  echo -e "${YELLOW}→ $1${NC}"
}

# 1. SSH into VPS and execute deployment steps
info "Connecting to ${SERVER}..."

ssh "${SSH_USER}@${SERVER}" /bin/bash << 'DEPLOY_SCRIPT'
set -e

APP_DIR="/var/www/telegram-bot"
BRANCH="main"

info() {
  echo "→ $1"
}

success() {
  echo "✓ $1"
}

error() {
  echo "ERROR: $1"
  exit 1
}

# Step 1: Check if app directory exists
if [ ! -d "${APP_DIR}" ]; then
  info "Creating application directory..."
  sudo mkdir -p "${APP_DIR}" || error "Failed to create directory"
  sudo chown -R deploy:deploy "${APP_DIR}" || error "Failed to set permissions"
fi

cd "${APP_DIR}" || error "Failed to change to app directory"

# Step 2: Clone/pull repository
if [ -d ".git" ]; then
  info "Repository exists, pulling latest changes..."
  git fetch origin || error "Failed to fetch from origin"
  git checkout "${BRANCH}" || error "Failed to checkout branch"
  git pull origin "${BRANCH}" || error "Failed to pull latest changes"
else
  info "Cloning repository..."
  error "Repository does not exist. Please clone manually or configure repository URL."
fi

# Step 3: Navigate to telegram-bot service directory
cd packages/agent-provisioning/services/telegram-bot || error "Failed to change to telegram-bot directory"

# Step 4: Install dependencies
info "Installing dependencies..."
npm ci --omit=dev || error "Failed to install dependencies"

# Step 5: Build application
info "Building application..."
npm run build || error "Build failed"

# Step 6: Verify .env file exists
if [ ! -f ".env" ]; then
  error "Missing .env file - please create it from .env.example and configure"
fi

info "Loading environment variables..."

# Step 7: Restart docker-compose
info "Restarting docker-compose services..."
docker-compose down || true
docker-compose build --no-cache || error "Docker build failed"
docker-compose up -d || error "Docker compose up failed"

success "Services started"

# Step 8: Wait for service to be ready
info "Waiting for service to be ready..."
MAX_RETRIES=30
RETRY_COUNT=0

while [ ${RETRY_COUNT} -lt ${MAX_RETRIES} ]; do
  if curl -s http://localhost:3335/health > /dev/null 2>&1; then
    success "Service is healthy"
    break
  fi
  RETRY_COUNT=$((RETRY_COUNT + 1))
  echo "  Waiting... (${RETRY_COUNT}/${MAX_RETRIES})"
  sleep 2
done

if [ ${RETRY_COUNT} -eq ${MAX_RETRIES} ]; then
  error "Service failed to become healthy"
fi

# Step 9: Verify service logs
info "Checking service logs..."
docker logs hfsp-telegram-bot | tail -20 || error "Failed to retrieve logs"

success "Deployment completed successfully!"

DEPLOY_SCRIPT

# Check SSH result
if [ $? -ne 0 ]; then
  error "Deployment failed"
fi

success "Deployment to ${SERVER} completed!"
echo ""
echo "Next steps:"
echo "1. Verify the service is running: ssh ${SSH_USER}@${SERVER} docker ps"
echo "2. Check logs: ssh ${SSH_USER}@${SERVER} docker logs -f hfsp-telegram-bot"
echo "3. Test webhook: curl http://${SERVER}:3335/health"
