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
function info(...args) { console.log(c.blue + 'i️' + c.reset, ...args); }

// Load from env or fail
const HFSP_URL = process.env.HFSP_URL || 'http://localhost:3001';
const HFSP_API_KEY = process.env.HFSP_API_KEY;
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const PAYMENT_WALLET = process.env.PAYMENT_WALLET || '3TyBTeqqN5NpMicX6JXAVAHqUyYLqSNz4EMtQxM34yMw';

const WIZARD_VERSION = '1.0.0';

function checkEnv() {
  const missing = [];
  if (!HFSP_API_KEY) missing.push('HFSP_API_KEY');
  if (!HELIUS_API_KEY) missing.push('HELIUS_API_KEY');
  if (missing.length > 0) {
    error('Missing required environment variables:');
    missing.forEach(v => error(`  - ${v}`));
    info('Create a .env file or export them:');
    info('  export HFSP_API_KEY=your_key');
    info('  export HELIUS_API_KEY=your_key');
    process.exit(1);
  }
}
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RUNTIME_IMAGE = 'hfsp/openclaw-runtime:stable';
const RUNTIME_DOCKERFILE = path.join(REPO_ROOT, 'packages', 'agent-provisioning', 'tenant-runtime-image');

const TIERS = [
  {
    id: 'tier_explorer',
    name: '🌱 Explorer',
    description: 'Shared container for experimenting',
    price_usd: 9,
    vps: '1.5GB RAM, 0.5 vCPU',
    max_agents: 1,
  },
  {
    id: 'tier_a',
    name: '🚀 Production',
    description: 'Dedicated VPS for serious agents',
    price_usd: 29,
    vps: '4GB RAM, 2 vCPU',
    max_agents: 1,
  },
  {
    id: 'tier_b',
    name: '🏢 Enterprise',
    description: 'Custom infrastructure with SLA',
    price_usd: 99,
    vps: '16GB RAM, 4 vCPU',
    max_agents: 5,
  },
];

const BUNDLES = [
  { id: 'solana', name: '🔷 Solana', description: 'Token analytics, wallet tools, DEX integration' },
  { id: 'research', name: '🔬 Research', description: 'Web search, data analysis, content generation' },
  { id: 'treasury', name: '💰 Treasury', description: 'Portfolio tracking, risk management, alerts' },
];

/**
 * Fetch current SOL/USD price from Jupiter API
 */
async function getSolPrice() {
  try {
    const res = await fetch('https://price.jup.ag/v6/price?ids=So11111111111111111111111111111111111111112');
    const data = await res.json();
    const price = data?.data?.So11111111111111111111111111111111111111112?.price;
    if (price) return price;
  } catch (e) {
    warn('Jupiter price fetch failed:', e.message);
  }

  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    const data = await res.json();
    const price = data?.solana?.usd;
    if (price) return price;
  } catch (e) {
    warn('CoinGecko price fetch failed:', e.message);
  }

  info('Using fallback SOL price: $150');
  return 150;
}

/**
 * Calculate SOL amount from USD price with 5% buffer
 */
function calculateSolAmount(usdPrice, solPriceUsd) {
  const buffer = 1.05;
  return Math.round((usdPrice * buffer) / solPriceUsd * 10000) / 10000;
}

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
      image: 'hfsp/openclaw-runtime:stable',
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
  const hfspKey = HFSP_API_KEY;

  log('Calling HFSP provisioning API...');
  info(`  API: ${hfspUrl}`);
  info(`  Tenant VPS: 187.124.173.69`);

  const deployPayload = {
    deployment_id: `clawdrop-${config.agent_name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
    tier_id: config.tier.id,
    payment_verified: config.payment.verified === true,
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

// ─── Payment Verification ─────────────────────────────────────────────────

async function verifyPayment(txHash, tier, wallet) {
  const heliusApiKey = HELIUS_API_KEY;
  const recipientWallet = PAYMENT_WALLET;
  
  // Calculate expected SOL amount dynamically
  const solPrice = await getSolPrice();
  const expectedAmount = calculateSolAmount(tier.price_usd, solPrice);
  
  try {
    log('Verifying payment on-chain...');
    info(`  Tx: ${txHash}`);
    info(`  Expected: ${expectedAmount} SOL (based on live price $${solPrice})`);

    // Call Helius API to get transaction
    const response = await fetch(
      `https://api-devnet.helius.xyz/v0/transactions/?api-key=${heliusApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: [txHash] }),
      }
    );

    if (!response.ok) {
      throw new Error(`Helius API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data || data.length === 0) {
      throw new Error('Transaction not found on-chain');
    }

    const tx = data[0];

    // Check transaction succeeded
    if (tx.meta && tx.meta.err) {
      throw new Error('Transaction failed on-chain');
    }

    // Find the SOL transfer to our wallet
    let receivedAmount = 0;

    if (tx.nativeTransfers) {
      for (const transfer of tx.nativeTransfers) {
        if (transfer.toUserAccount === recipientWallet) {
          receivedAmount += transfer.amount / 1_000_000_000; // Convert lamports to SOL
        }
      }
    }

    if (receivedAmount === 0) {
      throw new Error('No SOL transfer found to our wallet');
    }

    // Verify amount (allow 10% tolerance for fees/fluctuation)
    const minAmount = expectedAmount * 0.9;
    if (receivedAmount < minAmount) {
      throw new Error(`Insufficient payment. Expected: ${expectedAmount} SOL, Received: ${receivedAmount.toFixed(4)} SOL`);
    }

    success(`Payment verified! ✅ ${receivedAmount.toFixed(4)} SOL received`);
    return { verified: true, amount: receivedAmount, tx: txHash };

  } catch (err) {
    error('Payment verification failed:', err.message);
    return { verified: false, error: err.message };
  }
}

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
  const solPrice = await getSolPrice();

  console.log(`\n${c.bold}📋 Select Deployment Tier:${c.reset}\n`);
  console.log(`${c.dim}Current SOL price: $${solPrice} (fetched live)${c.reset}\n`);

  TIERS.forEach((tier, i) => {
    const solAmount = calculateSolAmount(tier.price_usd, solPrice);
    console.log(`  ${c.cyan}${i + 1}.${c.reset} ${tier.name}`);
    console.log(`     ${c.dim}${tier.description}${c.reset}`);
    console.log(`     💵 $${tier.price_usd}/mo (~${solAmount} SOL)`);
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
    console.log(`  [ ] ${bundle.id} - ${bundle.name}`);
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
  const solPrice = await getSolPrice();
  const solAmount = calculateSolAmount(tier.price_usd, solPrice);

  console.log(`\n${c.bold}💳 Payment: ${tier.name}${c.reset}`);
  console.log(`   Amount: $${tier.price_usd} (~${solAmount} SOL)\n`);
  console.log(`   ${c.dim}SOL price: $${solPrice} (live)${c.reset}\n`);

  info('Payment Options:');
  info('  1. SOL (devnet for testing)');
  info('  2. USDC');
  info('  3. HERD');
  info('  4. Skip (demo mode)\n');

  const choice = await ask('Select (1-4): ');

  if (choice === '4') {
    warn('Demo mode - no payment required');
    return { method: 'demo', tx_hash: 'demo_' + Date.now() };
  }

  const token = choice === '2' ? 'USDC' : choice === '3' ? 'HERD' : 'SOL';

  console.log(`\n📝 Send ${solAmount} ${token} to:`);
  console.log(`   ${c.cyan}${PAYMENT_WALLET}${c.reset}`);
  console.log(`   (Devnet for testing)\n`);

  const tx_hash = await ask('Transaction signature: ');

  if (!tx_hash || tx_hash.length < 20) {
    error('Invalid transaction signature');
    return stepPayment(tier);
  }

  // Verify payment on-chain
  const verification = await verifyPayment(tx_hash, tier);

  if (!verification.verified) {
    error('Payment verification failed:', verification.error);
    const retry = await ask('Try again? (y/n): ');
    if (retry.toLowerCase() === 'y') {
      return stepPayment(tier);
    }
    throw new Error('Payment verification failed');
  }

  return { method: token, tx_hash, verified: true, amount: verification.amount };
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

async function waitForAgentReady(metadata, maxAttempts = 30) {
  const hfspUrl = process.env.HFSP_URL || 'http://localhost:3001';
  const hfspKey = HFSP_API_KEY;

  log(`Waiting for agent container to start...`);
  info(`  Agent ID: ${metadata.agent_id}`);
  info(`  Max wait: ${maxAttempts * 2} seconds`);
  console.log();

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${hfspUrl}/api/v1/agents/${metadata.agent_id}/status`, {
        headers: { 'Authorization': `Bearer ${hfspKey}` },
      });

      if (response.ok) {
        const status = await response.json();

        if (status.status === 'running') {
          success('Agent container is running! ✅\n');
          return true;
        }

        process.stdout.write(`\r  ⏳ Attempt ${i + 1}/${maxAttempts} - Status: ${status.status || 'unknown'}`);
      }
    } catch (err) {
      process.stdout.write(`\r  ⏳ Attempt ${i + 1}/${maxAttempts} - Waiting for container...`);
    }

    await sleep(2000); // Wait 2 seconds between checks
  }

  console.log(); // New line after progress
  error('Agent container did not start within expected time.');
  info('You can check logs manually:');
  info(`  ssh root@187.124.173.69 "docker logs hfsp_${metadata.agent_id}"`);
  return false;
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
    info('No Telegram token provided - skipping pairing step.');
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
    info('  curl -H "Authorization: Bearer ' + HFSP_API_KEY + '"');
    info('    -X POST http://localhost:3001/api/v1/agents/' + metadata.agent_id + '/pair');
    info('    -d \'{"pairingCode":"YOUR_CODE"}\'');
    return;
  }

  log('Submitting pairing code...');

  try {
    const hfspUrl = process.env.HFSP_URL || 'http://localhost:3001';
    const hfspKey = HFSP_API_KEY;

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

    // Wait for container to be running before pairing
    const isReady = await waitForAgentReady(metadata);

    if (isReady && config.telegram_token) {
      await stepPairAgent(metadata, config);
    }

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
