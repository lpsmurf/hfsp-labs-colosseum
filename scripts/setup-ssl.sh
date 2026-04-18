#!/bin/bash
# SSL Certificate Setup Script for HFSP Labs
# Uses Let's Encrypt with certbot

set -e

DOMAIN="${1:-your-domain.com}"
EMAIL="${2:-admin@your-domain.com}"

echo "Setting up SSL for $DOMAIN..."

# Install certbot if not present
if ! command -v certbot &> /dev/null; then
    echo "Installing certbot..."
    sudo apt update
    sudo apt install -y certbot python3-certbot-nginx
fi

# Obtain certificate
sudo certbot --nginx -d "$DOMAIN" --email "$EMAIL" --agree-tos --non-interactive

# Auto-renewal is set up by certbot automatically
# Test renewal:
# sudo certbot renew --dry-run

echo "SSL setup complete for $DOMAIN"
echo "Certificate location: /etc/letsencrypt/live/$DOMAIN/"
