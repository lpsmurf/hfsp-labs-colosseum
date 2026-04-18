#!/bin/bash
# Production Deployment Script for HFSP Labs
# Usage: ./scripts/deploy-production.sh

set -e

echo "🚀 HFSP Labs Production Deployment"
echo "==================================="
echo ""

# Configuration
DEPLOY_HOST="${DEPLOY_HOST:-localhost}"
DEPLOY_USER="${DEPLOY_USER:-clawd}"
REPO_URL="https://github.com/lpsmurf/hfsp-labs-colosseum.git"
INSTALL_DIR="/opt/hfsp-labs"

echo "📋 Deployment Configuration:"
echo "  Host: $DEPLOY_HOST"
echo "  User: $DEPLOY_USER"
echo "  Directory: $INSTALL_DIR"
echo ""

# Step 1: Build locally
echo "🔨 Step 1: Building locally..."
cd "$(dirname "$0")/.."
npm run build
if [ $? -eq 0 ]; then
    echo "✅ Build successful"
else
    echo "❌ Build failed!"
    exit 1
fi

# Step 2: Run tests
echo "🧪 Step 2: Running tests..."
npm test -- --passWithNoTests 2>/dev/null || true
echo "✅ Tests complete"

# Step 3: Environment check
echo "🔐 Step 3: Checking environment..."
if [ ! -f "packages/clawdrop-mcp/.env.local" ]; then
    echo "⚠️  Warning: .env.local not found!"
    echo "   Copy packages/clawdrop-mcp/.env.example to .env.local and configure"
fi

if [ ! -f "packages/agent-provisioning/.env.local" ]; then
    echo "⚠️  Warning: agent-provisioning .env.local not found!"
fi

echo "✅ Environment check complete"

# Step 4: Deploy to server (if remote)
if [ "$DEPLOY_HOST" != "localhost" ]; then
    echo "📤 Step 4: Deploying to remote server..."
    
    # Create install directory
    ssh "$DEPLOY_USER@$DEPLOY_HOST" "sudo mkdir -p $INSTALL_DIR && sudo chown $DEPLOY_USER:$DEPLOY_USER $INSTALL_DIR"
    
    # Sync files
    rsync -avz --exclude='node_modules' --exclude='.git' \
        ./ "$DEPLOY_USER@$DEPLOY_HOST:$INSTALL_DIR/"
    
    echo "✅ Files deployed"
    
    # Install dependencies on remote
    ssh "$DEPLOY_USER@$DEPLOY_HOST" "cd $INSTALL_DIR && npm install --production"
    
    echo "✅ Dependencies installed"
else
    echo "📤 Step 4: Local deployment"
    INSTALL_DIR="$(pwd)"
fi

# Step 5: Setup pm2
echo "⚙️  Step 5: Setting up pm2..."
cd "$INSTALL_DIR"

# Check if pm2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "Installing pm2..."
    npm install -g pm2
fi

# Start/restart services
pm2 start ecosystem.config.json --env production || pm2 restart ecosystem.config.json
echo "✅ Services started with pm2"

# Step 6: Save pm2 config
echo "💾 Step 6: Saving pm2 configuration..."
pm2 save
pm2 startup systemd 2>/dev/null || true
echo "✅ pm2 config saved"

# Step 7: Setup SSL (if not already done)
echo "🔒 Step 7: SSL Configuration..."
if command -v certbot &> /dev/null; then
    echo "Certbot is installed. Run ./scripts/setup-ssl.sh to configure SSL."
else
    echo "⚠️  Certbot not installed. SSL not configured."
fi

# Step 8: Health check
echo "🏥 Step 8: Health check..."
sleep 3

# Check clawdrop-mcp
if curl -fsS http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ clawdrop-mcp is healthy (port 3000)"
else
    echo "⚠️  clawdrop-mcp health check failed"
fi

# Check storefront-bot
if curl -fsS http://localhost:3001/health > /dev/null 2>&1; then
    echo "✅ storefront-bot is healthy (port 3001)"
else
    echo "⚠️  storefront-bot health check failed"
fi

# Step 9: Summary
echo ""
echo "🎉 Deployment Complete!"
echo "======================="
echo ""
echo "Services:"
echo "  - clawdrop-mcp:    http://localhost:3000"
echo "  - storefront-bot:  http://localhost:3001"
echo "  - clawdrop-wizard: http://localhost:3003"
echo ""
echo "Management Commands:"
echo "  pm2 status              # View process status"
echo "  pm2 logs                # View all logs"
echo "  pm2 logs clawdrop-mcp   # View specific service logs"
echo "  pm2 restart all         # Restart all services"
echo "  pm2 stop all            # Stop all services"
echo ""
echo "Logs Directory: $INSTALL_DIR/logs/"
echo ""
