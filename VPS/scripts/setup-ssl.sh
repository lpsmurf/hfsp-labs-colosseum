#!/bin/bash
# Let's Encrypt SSL setup for clawdrop.live on a VPS
# Usage: bash VPS/scripts/setup-ssl.sh clawdrop.live admin@clawdrop.live

set -e
DOMAIN="${1:-clawdrop.live}"
EMAIL="${2:-admin@clawdrop.live}"

echo "Setting up SSL for $DOMAIN with email $EMAIL..."

if ! command -v certbot &>/dev/null; then
    apt update && apt install -y certbot python3-certbot-nginx
fi

# Obtain cert (nginx plugin handles nginx reload)
certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" \
    --email "$EMAIL" \
    --agree-tos \
    --non-interactive \
    --redirect

# Verify auto-renewal timer
systemctl status certbot.timer || systemctl enable certbot.timer

echo "SSL certificate issued for $DOMAIN"
echo "Certificate path: /etc/letsencrypt/live/$DOMAIN/"
echo "Auto-renewal: managed by certbot.timer systemd unit"
