#!/bin/bash
# Full VPS setup script for clawdrop.live services
# Run on a fresh Ubuntu 24.04 LTS VPS as root
# Usage: bash VPS/scripts/setup-vps.sh

set -e

REPO_URL="https://github.com/lpsmurf/hfsp-labs-colosseum.git"
INSTALL_DIR="/opt/hfsp-labs"
DEPLOY_USER="clawd"
DOMAIN="clawdrop.live"

echo "=== Clawdrop VPS Setup ==="
echo "Domain: $DOMAIN"
echo "Install dir: $INSTALL_DIR"

# System deps
apt update && apt upgrade -y
apt install -y curl git nginx certbot python3-certbot-nginx ufw

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# PM2
npm install -g pm2

# Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# Create deploy user
useradd -m -s /bin/bash $DEPLOY_USER || true
usermod -aG docker $DEPLOY_USER

# Clone repo
mkdir -p $INSTALL_DIR
git clone $REPO_URL $INSTALL_DIR || (cd $INSTALL_DIR && git pull)
chown -R $DEPLOY_USER:$DEPLOY_USER $INSTALL_DIR

# Install deps and build
cd $INSTALL_DIR
npm install
npm run build

# Copy nginx config
cp VPS/nginx/conf.d/clawdrop.conf /etc/nginx/conf.d/clawdrop.conf
nginx -t && systemctl enable nginx && systemctl start nginx

# Firewall
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# PM2 setup
cp VPS/pm2/ecosystem.config.json $INSTALL_DIR/ecosystem.config.json
pm2 start $INSTALL_DIR/ecosystem.config.json --env production
pm2 save
pm2 startup systemd

# Copy .env files (must be done manually — secrets not in repo)
echo ""
echo "=== MANUAL STEPS REQUIRED ==="
echo "1. Copy .env files to $INSTALL_DIR:"
echo "   .env.platform  → $INSTALL_DIR/.env.platform"
echo "   packages/trial-api/.env → $INSTALL_DIR/packages/trial-api/.env"
echo "   packages/clawdrop-platform/.env → $INSTALL_DIR/packages/clawdrop-platform/.env"
echo ""
echo "2. Set up SSL:"
echo "   bash VPS/scripts/setup-ssl.sh $DOMAIN admin@$DOMAIN"
echo ""
echo "3. Update DNS: A record $DOMAIN → $(curl -s ifconfig.me)"
echo ""
echo "Setup complete."
