#!/bin/bash
# Generate JWT RSA Key Pair for Phase 4 Authentication
# Usage: ./scripts/generate-jwt-keys.sh

set -e

KEY_DIR="${1:-./keys}"
mkdir -p "$KEY_DIR"

echo "Generating RSA key pair for JWT signing..."

# Generate private key (2048 bits)
openssl genrsa -out "$KEY_DIR/jwt-private.pem" 2048
echo "✅ Private key: $KEY_DIR/jwt-private.pem"

# Extract public key
openssl rsa -in "$KEY_DIR/jwt-private.pem" -pubout -out "$KEY_DIR/jwt-public.pem"
echo "✅ Public key: $KEY_DIR/jwt-public.pem"

# Convert to base64 for environment variables
PRIVATE_KEY_B64=$(base64 -i "$KEY_DIR/jwt-private.pem" | tr -d '\n')
PUBLIC_KEY_B64=$(base64 -i "$KEY_DIR/jwt-public.pem" | tr -d '\n')

echo ""
echo "Base64-encoded keys for .env file:"
echo ""
echo "JWT_PRIVATE_KEY=$PRIVATE_KEY_B64"
echo ""
echo "JWT_PUBLIC_KEY=$PUBLIC_KEY_B64"
echo ""

# Save to .env file
ENV_FILE="$KEY_DIR/jwt-keys.env"
echo "JWT_PRIVATE_KEY=$PRIVATE_KEY_B64" > "$ENV_FILE"
echo "JWT_PUBLIC_KEY=$PUBLIC_KEY_B64" >> "$ENV_FILE"
echo "JWT_EXPIRY=3600" >> "$ENV_FILE"

echo "✅ Keys saved to: $ENV_FILE"
echo ""
echo "Add these to your .env.local file:"
echo "  source $ENV_FILE"
