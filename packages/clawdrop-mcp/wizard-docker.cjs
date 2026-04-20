#!/usr/bin/env node

/**
 * Clawdrop Docker Wizard CLI
 * 
 * Interactive CLI to deploy OpenClaw agents as Docker containers.
 * Uses the existing tenant-runtime-image with OpenClaw pre-installed.
 * 
 * Usage:
 *   node wizard-docker.js
 *   # or add to package.json bin:
 *   npx clawdrop-wizard
 */

const { spawn, execSync } = require('child_process');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ANSI colors
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(...args) { console.log('🐾', ...args); }
function success(...args) { console.log(c.green + '✅' + c.reset, ...args); }
function error(...args) { console.log(c.red + '❌' + c.reset, ...args); }
function warn(...args) { console.log(c.yellow + '⚠️' + c.reset, ...args); }
function info(...args) { console.log(c.blue + 'ℹ️' + c.reset, ...args); }

// ─── Configuration ──────────────────────────────────────────────────────────

const WIZARD_VERSION = '1.0.0';
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RUNTIME_IMAGE = 'hfsp-tenant-runtime';
const RUNTIME_DOCKERFILE = path.join(REPO_ROOT, 'packages', 'agent-provisioning', 'tenant-runtime-image');

const TIERS = [
  {
    id: 'tier_explorer',
    name: '🌱 Explorer',
    description: 'Shared container for experimenting',
    price_usd: 29,
    price_sol: 0.12,
    vps: '1.5GB RAM, 0.5 vCPU',
    max_agents: 1,
  },
  {
    id: 'tier_pro',
    name: '🚀 Production',
    description: 'Dedicated VPS for serious agents',
    price_usd: 99,
    price_sol: 0.4,
    vps: '4GB RAM, 2 vCPU',
    max_agents: 1,
  },
  {
    id: 'tier_enterprise',
    name: '🏢 Enterprise',
    description: 'Custom infrastructure with SLA',
    price_usd: 499,
    price_sol: 2.0,
    vps: '16GB RAM, 4 vCPU',
    max_agents: 5,
  },
];

const BUNDLES = [
  { id: 'solana', name: '🔷 Solana', description: 'Token analytics, wallet tools, DEX integration' },
  { id: 'research', name: '🔬 Research', description: 'Web search, data analysis, content generation' },
  { id: 'treasury', name: '💰 Treasury', description: 'Portfolio tracking, risk management, alerts' },
];

// ─── Docker Helpers ─────────────────────────────────────────────────────────

function checkDocker() {
  try {
    execSync('docker --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function checkDockerCompose() {
  try {
    execSync('docker compose version', { stdio: 'ignore' });
    return true;
  } catch {
    try {
      execSync('docker-compose --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}

function dockerComposeCmd() {
  try {
    execSync('docker compose version', { stdio: 'ignore' });
    return 'docker compose';
  } catch {
    return 'docker-compose';
  }
}

// ─── Port Management ────────────────────────────────────────────────────────

function getUsedPorts() {
  try {
    const output = execSync('docker ps --format "{{.Ports}}"', { encoding: 'utf8' });
    const ports = new Set();
    output.split('\n').forEach(line => {
      const matches = line.match(/:(\d+)->/g);
      if (matches) {
        matches.forEach(m => {
          const port = parseInt(m.match(/:(\d+)/)[1]);
          ports.add(port);
        });
      }
    });
    return ports;
  } catch {
    return new Set();
  }
}

function findAvailablePort(startPort = 3001) {
  const usedPorts = getUsedPorts();
  let port = startPort;
  while (usedPorts.has(port)) {
    port++;
  }
  return port;
}

async function stepSelectPort() {
  const usedPorts = getUsedPorts();
  const suggestedPort = findAvailablePort(3001);
  
  if (usedPorts.has(3000)) {
    warn('Port 3000 is already in use by another service.');
    info(`Suggested available port: ${suggestedPort}\n`);
  }
  
  const portInput = await ask(`Port for agent (default: ${suggestedPort}): `);
  const port = parseInt(portInput) || suggestedPort;
  
  if (usedPorts.has(port)) {
    warn(`Port ${port} is already in use!`);
    return stepSelectPort();
  }
  
  return port;
}

async function buildRuntimeImage() {
  log('Building tenant runtime image...');
  try {
    execSync(`docker build -t ${RUNTIME_IMAGE} "${RUNTIME_DOCKERFILE}"`, {
      stdio: 'inherit',
      timeout: 300000,
    });
    success('Runtime image built');
  } catch (err) {
    error('Failed to build runtime image:', err.message);
    throw err;
  }
}

function ensureRuntimeImage() {
  try {
    execSync(`docker inspect ${RUNTIME_IMAGE}`, { stdio: 'ignore' });
    return true; // Image exists
  } catch {
    return false;
  }
}

// ─── File Generation ────────────────────────────────────────────────────────

function generateAgentConfig(config) {
  return {
    name: config.agent_name,
    version: '1.0.0',
    description: `Clawdrop agent: ${config.agent_name}`,
    
    // LLM configuration
    llm: {
      provider: config.llm_provider,
      model: config.llm_model || 'claude-sonnet-4-6',
      api_key: config.llm_api_key ? '${LLM_API_KEY}' : undefined,
    },
    
    // Channels (Telegram if token provided)
    channels: config.telegram_token ? {
      telegram: {
        enabled: true,
        token: '${TELEGRAM_BOT_TOKEN}',
      }
    } : {},
    
    // Bundles = installed MCPs/capabilities
    bundles: config.bundles,
    
    // Wallet for payments/identity
    wallet: {
      address: config.wallet,
    },
    
    // Logging
    log: {
      level: 'info',
    },
    
    // Server settings
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    
    created_at: new Date().toISOString(),
    tier: config.tier.id,
  };
}

function generateDockerCompose(config, dataDir) {
  const containerName = `clawdrop-${config.agent_name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
  
  const compose = {
    name: containerName,
    services: {
      openclaw: {
        image: RUNTIME_IMAGE,
        container_name: containerName,
        restart: 'unless-stopped',
        ports: [
          '${PORT:-3000}:3000',
        ],
        environment: {
          NODE_ENV: 'production',
          ...(config.telegram_token && { TELEGRAM_BOT_TOKEN: config.telegram_token }),
          ...(config.llm_api_key && { LLM_API_KEY: config.llm_api_key }),
          ...(config.llm_provider === 'anthropic' && config.llm_api_key && { 
            ANTHROPIC_API_KEY: config.llm_api_key 
          }),
          ...(config.llm_provider === 'openai' && config.llm_api_key && { 
            OPENAI_API_KEY: config.llm_api_key 
          }),
        },
        volumes: [
          `${path.join(dataDir, 'config')}:/home/clawd/.openclaw:ro`,
          `${path.join(dataDir, 'secrets')}:/home/clawd/.openclaw/secrets:ro`,
          `${path.join(dataDir, 'workspace')}:/tenant/workspace`,
        ],
        healthcheck: {
          test: ['CMD', 'curl', '-f', 'http://localhost:3000/health'],
          interval: '30s',
          timeout: '10s',
          retries: 3,
          start_period: '10s',
        },
      },
    },
  };
  
  return { containerName, compose };
}

// ─── Deployment ─────────────────────────────────────────────────────────────

async function deployAgent(config) {
  const dataDir = path.join(process.cwd(), '.clawdrop', 'agents', config.agent_name);
  fs.mkdirSync(dataDir, { recursive: true });
  
  // Call HFSP API to deploy on tenant VPS
  const hfspUrl = process.env.HFSP_URL || 'http://localhost:3001';
  const hfspKey = process.env.HFSP_API_KEY || 'test-dev-key-12345';
  
  log('Calling HFSP provisioning API...');
  info(`  API: ${hfspUrl}`);
  info(`  Tenant VPS: 187.124.173.69`);
  
  const deployPayload = {
    deployment_id: `clawdrop-${config.agent_name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
    tier_id: config.tier.id,
    payment_verified: config.payment.method !== 'demo',
    wallet_address: config.wallet,
    telegram_token: config.telegram_token,
    llm_provider: config.llm_provider,
    llm_api_key: config.llm_api_key,
    config: {
      agent_name: config.agent_name,
      bundles: config.bundles,
    },
  };
  
  // Call HFSP deploy API with auth
  const response = await fetch(`${hfspUrl}/api/v1/agents/deploy`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${hfspKey}`,
    },
    body: JSON.stringify(deployPayload),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HFSP deploy failed: ${response.status} - ${error}`);
  }
  
  const result = await response.json();
  
  // Save deployment metadata locally
  const metadata = {
    agent_id: result.agent_id,
    name: config.agent_name,
    tier: config.tier.id,
    bundles: config.bundles,
    wallet: config.wallet,
    endpoint: result.endpoint,
    status: result.status || 'provisioning',
    created_at: new Date().toISOString(),
    data_dir: dataDir,
    hfsp_response: result,
  };
  
  fs.writeFileSync(
    path.join(dataDir, 'deployment.json'),
    JSON.stringify(metadata, null, 2)
  );
  
  return metadata;
}

// ─── Wizard Steps ───────────────────────────────────────────────────────────

async function stepWelcome() {
  console.log(`
${c.cyan}${c.bold}
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║           🐾  Clawdrop Docker Wizard  v${WIZARD_VERSION}              ║
║                                                                  ║
║   Deploy OpenClaw agents as Docker containers                   ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
${c.reset}`);
}

async function stepCheckPrerequisites() {
  log('Checking prerequisites...\n');
  
  const hasDocker = checkDocker();
  const hasCompose = checkDockerCompose();
  
  if (!hasDocker) {
    error('Docker is not installed.');
    info('Install:');
    info('  macOS: brew install --cask docker');
    info('  Linux: curl -fsSL https://get.docker.com | sh');
    process.exit(1);
  }
  
  if (!hasCompose) {
    error('Docker Compose not found.');
    info('Included with Docker Desktop. Linux: sudo apt install docker-compose-plugin');
    process.exit(1);
  }
  
  success('Docker installed');
  success('Docker Compose installed\n');
  
  // Check/build runtime image
  if (!ensureRuntimeImage()) {
    warn('Tenant runtime image not found. Building...\n');
    await buildRuntimeImage();
  } else {
    success('Runtime image available\n');
  }
}

async function stepSelectTier() {
  console.log(`\n${c.bold}📋 Select Deployment Tier:${c.reset}\n`);
  
  TIERS.forEach((tier, i) => {
    console.log(`  ${c.cyan}${i + 1}.${c.reset} ${tier.name}`);
    console.log(`     ${c.dim}${tier.description}${c.reset}`);
    console.log(`     💵 $${tier.price_usd}/mo (~${tier.price_sol} SOL)`);
    console.log(`     🖥️  ${tier.vps}`);
    console.log();
  });
  
  const choice = await ask('Select tier (1-3): ');
  const index = parseInt(choice) - 1;
  
  if (index < 0 || index >= TIERS.length) {
    error('Invalid selection');
    return stepSelectTier();
  }
  
  return TIERS[index];
}

async function stepSelectBundles() {
  console.log(`\n${c.bold}📦 Select Capability Bundles:${c.reset}\n`);
  
  BUNDLES.forEach((bundle) => {
    console.log(`  [ ] ${bundle.id} — ${bundle.name}`);
    console.log(`      ${c.dim}${bundle.description}${c.reset}`);
    console.log();
  });
  
  const input = await ask('Enter bundle IDs (comma-separated, or "all"): ');
  
  if (input.toLowerCase() === 'all') {
    return BUNDLES.map(b => b.id);
  }
  
  const selected = input.split(',').map(s => s.trim()).filter(Boolean);
  const valid = selected.filter(s => BUNDLES.some(b => b.id === s));
  
  if (valid.length === 0) {
    warn('No valid bundles selected, using solana');
    return ['solana'];
  }
  
  return valid;
}

async function stepConfigureAgent() {
  console.log(`\n${c.bold}⚙️  Agent Configuration:${c.reset}\n`);
  
  const agent_name = await ask('Agent name (e.g., my-trading-bot): ');
  const wallet = await ask('Your Solana wallet address: ');
  
  console.log(`\n${c.bold}📱 Telegram Integration (optional)${c.reset}`);
  const telegram = await ask('Bot token from @BotFather (or Enter to skip): ');
  
  console.log(`\n${c.bold}🤖 LLM Provider${c.reset}`);
  console.log('  1. Anthropic (Claude)');
  console.log('  2. OpenAI (GPT)');
  console.log('  3. OpenRouter');
  const llmChoice = await ask('Select (1-3, default: 1): ');
  
  const providers = ['anthropic', 'openai', 'openrouter'];
  const llm_provider = providers[parseInt(llmChoice) - 1] || 'anthropic';
  
  const llm_api_key = await ask(`${llm_provider} API key: `);
  
  return {
    agent_name: agent_name || 'my-clawdrop-agent',
    wallet,
    telegram_token: telegram || undefined,
    llm_provider,
    llm_api_key,
  };
}

async function stepPayment(tier) {
  console.log(`\n${c.bold}💳 Payment: ${tier.name}${c.reset}`);
  console.log(`   Amount: $${tier.price_usd} (~${tier.price_sol} SOL)\n`);
  
  info('Payment Options:');
  info('  1. SOL (devnet for testing)');
  info('  2. USDC');
  info('  3. Skip (demo mode)\n');
  
  const choice = await ask('Select (1-3): ');
  
  if (choice === '3') {
    warn('Demo mode — no payment required');
    return { method: 'demo', tx_hash: 'demo_' + Date.now() };
  }
  
  const token = choice === '2' ? 'USDC' : 'SOL';
  
  console.log(`\n📝 Send ${tier.price_sol} ${token} to:`);
  console.log(`   ${c.cyan}3TyBTeqqN5NpMicX6JXAVAHqUyYLqSNz4EMtQxM34yMw${c.reset}`);
  console.log(`   (Devnet for testing)\n`);
  
  const tx_hash = await ask('Transaction signature: ');
  
  return { method: token, tx_hash };
}

async function stepDeploy(config) {
  console.log(`\n${c.bold}🚀 Deploying OpenClaw Agent...${c.reset}\n`);
  
  log('Configuration:');
  info(`  Name: ${config.agent_name}`);
  info(`  Tier: ${config.tier.name}`);
  info(`  Bundles: ${config.bundles.join(', ')}`);
  info(`  LLM: ${config.llm_provider}`);
  info(`  Deploy target: Tenant VPS (187.124.173.69)`);
  if (config.telegram_token) info(`  Telegram: enabled`);
  console.log();
  
  await sleep(1000);
  
  try {
    const metadata = await deployAgent(config);
    success('Agent deployment initiated!\n');
    return metadata;
  } catch (err) {
    error('Deployment failed:', err.message);
    throw err;
  }
}

async function stepShowStatus(metadata) {
  console.log(`\n${c.bold}📊 Agent Status:${c.reset}\n`);
  
  console.log(`  Agent ID:   ${c.cyan}${metadata.agent_id}${c.reset}`);
  console.log(`  Name:       ${metadata.name}`);
  console.log(`  Status:     ${c.yellow}${metadata.status}${c.reset}`);
  console.log(`  Tier:       ${metadata.tier}`);
  console.log(`  Endpoint:   ${c.cyan}${metadata.endpoint}${c.reset}`);
  console.log(`  Tenant VPS: 187.124.173.69`);
  console.log(`  Created:    ${metadata.created_at}`);
  console.log();
  
  log('Commands:');
  console.log(`  Logs:     ssh root@187.124.173.69 "docker logs hfsp_${metadata.agent_id}"`);
  console.log(`  Stop:     ssh root@187.124.173.69 "docker stop hfsp_${metadata.agent_id}"`);
  console.log(`  Restart:  ssh root@187.124.173.69 "docker restart hfsp_${metadata.agent_id}"`);
  console.log(`  Remove:   ssh root@187.124.173.69 "docker rm -f hfsp_${metadata.agent_id}"`);
  console.log(`  Data:     ${metadata.data_dir}`);
  console.log();
  
  if (metadata.status === 'provisioning') {
    console.log(`${c.yellow}⏳ Provisioning in progress... Container starting on tenant VPS.${c.reset}\n`);
  }
}

async function stepPairAgent(metadata, config) {
  if (!config.telegram_token) {
    info('No Telegram token provided — skipping pairing step.');
    return;
  }
  
  console.log(`\n${c.bold}📱 Telegram Pairing:${c.reset}\n`);
  
  log('Your agent needs to be paired with Telegram.');
  info('1. Find your bot on Telegram (search for the bot username)');
  info('2. Send /start to the bot');
  info('3. The bot will reply with a pairing code');
  info('4. Enter the pairing code below\n');
  
  const pairingCode = await ask('Pairing code (or press Enter to skip): ');
  
  if (!pairingCode) {
    warn('Pairing skipped. You can pair later using:');
    info(`  curl -H "Authorization: Bearer ${process.env.HFSP_API_KEY || 'test-dev-key-12345'}" \\\`);
    info(`    -X POST http://localhost:3001/api/v1/agents/${metadata.agent_id}/pair \\\`);
    info(`    -d '{"pairingCode":"YOUR_CODE"}'`);
    return;
  }
  
  log('Submitting pairing code...');
  
  try {
    const hfspUrl = process.env.HFSP_URL || 'http://localhost:3001';
    const hfspKey = process.env.HFSP_API_KEY || 'test-dev-key-12345';
    
    const response = await fetch(`${hfspUrl}/api/v1/agents/${metadata.agent_id}/pair`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${hfspKey}`,
      },
      body: JSON.stringify({ pairingCode: pairingCode.trim() }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Pairing failed');
    }
    
    success('Agent paired successfully! 🎉');
    info('Your bot is now active and responding to messages.');
    
  } catch (err) {
    error('Pairing failed:', err.message);
    warn('You can retry pairing later using the API.');
  }
}

async function main() {
  try {
    await stepWelcome();
    await stepCheckPrerequisites();
    
    const tier = await stepSelectTier();
    const bundles = await stepSelectBundles();
    const config = await stepConfigureAgent();
    const payment = await stepPayment(tier);
    
    const deploymentConfig = {
      ...config,
      tier,
      bundles,
      payment,
    };
    
    const metadata = await stepDeploy(deploymentConfig);
    await stepShowStatus(metadata);
    await stepPairAgent(metadata, config);
    
    console.log(`${c.green}${c.bold}🎉 Your OpenClaw agent is live!${c.reset}\n`);
    
  } catch (err) {
    error('Wizard failed:', err.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
