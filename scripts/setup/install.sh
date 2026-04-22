#!/usr/bin/env bash
# Clawdrop Lightweight Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/lpsmurf/hfsp-labs-colosseum/main/install.sh | bash

set -e

REPO="lpsmurf/hfsp-labs-colosseum"
INSTALL_DIR="${HOME}/.clawdrop"
BIN_DIR="${HOME}/.local/bin"

echo "🐾 Installing Clawdrop..."

# Create dirs
mkdir -p "$INSTALL_DIR" "$BIN_DIR"

# Download pre-built CLI + API files
echo "📦 Downloading latest build..."
curl -fsSL "https://raw.githubusercontent.com/${REPO}/main/packages/clawdrop-mcp/cli.cjs" > "${INSTALL_DIR}/cli.cjs"
curl -fsSL "https://raw.githubusercontent.com/${REPO}/main/packages/clawdrop-mcp/dist/api-server.js" > "${INSTALL_DIR}/api-server.js"

# Download all dist modules (needed by api-server)
for file in $(curl -fsSL "https://api.github.com/repos/${REPO}/git/trees/main?recursive=1" | grep '"path": "packages/clawdrop-mcp/dist/' | sed 's/.*"path": "//;s/".*//' | grep '\.js$'); do
  local_path="${INSTALL_DIR}/$(basename $(dirname $file))"
  mkdir -p "$local_path"
  curl -fsSL "https://raw.githubusercontent.com/${REPO}/main/${file}" > "${INSTALL_DIR}/${file#packages/clawdrop-mcp/}"
done

# Create .env if not exists
if [ ! -f "${INSTALL_DIR}/.env" ]; then
  cat > "${INSTALL_DIR}/.env" << 'EOF'
# Clawdrop Configuration
HELIUS_API_KEY=7297b07c-c4d0-46f4-b8f7-242c25005e9c
HELIUS_DEVNET_RPC=https://devnet.helius-rpc.com/?api-key=7297b07c-c4d0-46f4-b8f7-242c25005e9c
CLAWDROP_WALLET_ADDRESS=3TyBTeqqN5NpMicX6JXAVAHqUyYLqSNz4EMtQxM34yMw
CLAWDROP_FEE_WALLET=3TyBTeqqN5NpMicX6JXAVAHqUyYLqSNz4EMtQxM34yMw
HFSP_API_URL=http://localhost:3001
HFSP_API_KEY=test-dev-key-12345
PORT=3000
NODE_ENV=production
EOF
  echo "⚙️  Created default .env (devnet demo)"
fi

# Create wrapper script
cat > "${BIN_DIR}/clawdrop" << 'EOF'
#!/usr/bin/env bash
INSTALL_DIR="${HOME}/.clawdrop"
cd "$INSTALL_DIR"

# Check if API is running
if ! curl -fs http://localhost:3000/health >/dev/null 2>&1; then
  echo "🚀 Starting Clawdrop API..."
  nohup node api-server.js > /tmp/clawdrop-api.log 2>&1 &
  sleep 3
fi

# Run CLI
CLAWDROP_API_URL=http://localhost:3000 node cli.cjs "$@"
EOF
chmod +x "${BIN_DIR}/clawdrop"

# Add to PATH if needed
if [[ ":$PATH:" != *":${BIN_DIR}:"* ]]; then
  echo 'export PATH="${HOME}/.local/bin:${PATH}"' >> "${HOME}/.bashrc"
  echo 'export PATH="${HOME}/.local/bin:${PATH}"' >> "${HOME}/.zshrc" 2>/dev/null || true
  echo "📌 Added ${BIN_DIR} to PATH (restart terminal or run: export PATH=\"${BIN_DIR}:\$PATH\")"
fi

echo ""
echo "✅ Clawdrop installed!"
echo ""
echo "Usage:"
echo "  clawdrop              # Interactive mode"
echo "  CLAWDROP_DEMO=1 clawdrop  # Demo/video mode"
echo ""
echo "Note: Make sure Node.js is installed (node -v)"
