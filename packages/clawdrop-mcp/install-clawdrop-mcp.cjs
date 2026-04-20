#!/usr/bin/env node

/**
 * Clawdrop MCP Server Installer for Claude Code
 * Cross-platform: works on macOS, Linux, Windows
 * 
 * Usage:
 *   npx clawdrop-mcp-install
 *   # or
 *   node install-clawdrop-mcp.cjs
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const CLAWDROP_URL = 'https://claude.clawdrop.live/sse';

function getConfigPath() {
  const home = os.homedir();
  
  // macOS
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Claude', 'settings.json');
  }
  
  // Windows
  if (process.platform === 'win32') {
    return path.join(home, 'AppData', 'Roaming', 'Claude', 'settings.json');
  }
  
  // Linux and others
  return path.join(home, '.config', 'claude', 'settings.json');
}

function readConfig(configPath) {
  try {
    const data = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {};
    }
    throw new Error(`Failed to read config: ${err.message}`);
  }
}

function writeConfig(configPath, config) {
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function installClawdropMcp() {
  console.log('🐾 Clawdrop MCP Server Installer');
  console.log('=================================\n');
  
  const configPath = getConfigPath();
  console.log(`📁 Config path: ${configPath}`);
  
  // Read existing config
  let config = readConfig(configPath);
  
  // Check if mcpServers exists
  if (!config.mcpServers) {
    config.mcpServers = {};
  }
  
  // Check if clawdrop already configured
  if (config.mcpServers.clawdrop) {
    console.log(`⚠️  Clawdrop MCP server already configured`);
    console.log(`   Current URL: ${config.mcpServers.clawdrop.url || 'not set'}`);
    
    // In non-TTY mode (piped), auto-overwrite
    if (process.stdin.isTTY) {
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      return new Promise((resolve) => {
        rl.question('Overwrite? (y/N): ', (answer) => {
          rl.close();
          if (!answer.match(/^[Yy]$/)) {
            console.log('❌ Installation cancelled');
            resolve(false);
            return;
          }
          doInstall(configPath, config);
          resolve(true);
        });
      });
    }
  }
  
  doInstall(configPath, config);
  return Promise.resolve(true);
}

function doInstall(configPath, config) {
  // Add/update clawdrop
  config.mcpServers.clawdrop = {
    url: CLAWDROP_URL
  };
  
  // Write config
  writeConfig(configPath, config);
  
  console.log('\n✅ Clawdrop MCP server added!');
  console.log(`   Config file: ${configPath}`);
  console.log(`   SSE URL: ${CLAWDROP_URL}`);
  console.log('\n📝 Next steps:');
  console.log('   1. Restart Claude Code');
  console.log('   2. Ask: "What tools do you have from Clawdrop?"');
  console.log('   3. Or: "Deploy an OpenClaw agent"');
  console.log('\n🔗 Test connection:');
  console.log(`   curl -s ${CLAWDROP_URL}/health`);
}

// Run if called directly
if (require.main === module) {
  installClawdropMcp().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
}

module.exports = { installClawdropMcp, getConfigPath };
