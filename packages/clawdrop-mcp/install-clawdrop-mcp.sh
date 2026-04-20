#!/usr/bin/env bash

# Clawdrop MCP Server Installer for Claude Code
# Usage: ./install-clawdrop-mcp.sh

set -e

CLAWDROP_URL="https://claude.clawdrop.live/sse"
CONFIG_DIR="${HOME}/.config/claude"
CONFIG_FILE="${CONFIG_DIR}/settings.json"

echo "🐾 Clawdrop MCP Server Installer"
echo "================================="
echo ""

# Create config directory if needed
mkdir -p "$CONFIG_DIR"

# Read existing config or create new
if [ -f "$CONFIG_FILE" ]; then
    echo "📁 Found existing Claude Code config"
    CONFIG=$(cat "$CONFIG_FILE")
else
    echo "🆕 Creating new Claude Code config"
    CONFIG='{}'
fi

# Check if mcpServers exists
if echo "$CONFIG" | jq -e '.mcpServers' >/dev/null 2>&1; then
    # Check if clawdrop already exists
    if echo "$CONFIG" | jq -e '.mcpServers.clawdrop' >/dev/null 2>&1; then
        echo "⚠️  Clawdrop MCP server already configured"
        echo "   Current URL: $(echo "$CONFIG" | jq -r '.mcpServers.clawdrop.url // "not set"')"
        read -p "Overwrite? (y/N): " overwrite
        if [[ ! "$overwrite" =~ ^[Yy]$ ]]; then
            echo "❌ Installation cancelled"
            exit 0
        fi
    fi
    # Add/update clawdrop
    UPDATED=$(echo "$CONFIG" | jq --arg url "$CLAWDROP_URL" '.mcpServers.clawdrop = {"url": $url}')
else
    # Create mcpServers with clawdrop
    UPDATED=$(echo "$CONFIG" | jq --arg url "$CLAWDROP_URL" '. + {mcpServers: {clawdrop: {"url": $url}}}')
fi

# Write updated config
echo "$UPDATED" | jq . > "$CONFIG_FILE"

echo ""
echo "✅ Clawdrop MCP server added!"
echo "   Config file: $CONFIG_FILE"
echo "   SSE URL: $CLAWDROP_URL"
echo ""
echo "📝 Next steps:"
echo "   1. Restart Claude Code"
echo "   2. Ask: 'What tools do you have from Clawdrop?'"
echo "   3. Or: 'Deploy an OpenClaw agent'"
echo ""
echo "🔗 Test connection:"
echo "   curl -s $CLAWDROP_URL/health"
