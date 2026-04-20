#!/usr/bin/env node

/**
 * Clawdrop CLI - Lightweight Deployment Walkthrough
 * 
 * This CLI is self-contained. It:
 * 1. Checks if API server dependencies are installed
 * 2. Starts the API server automatically
 * 3. Runs the interactive 5-step deployment flow
 * 
 * Usage:
 *   npx github:lpsmurf/hfsp-labs-colosseum
 *   CLAWDROP_DEMO=1 npx github:lpsmurf/hfsp-labs-colosseum
 */

const http = require('http');
const https = require('https');
const readline = require('readline');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEMO_MODE = process.env.CLAWDROP_DEMO === '1';
const SKIP_INSTALL = process.env.CLAWDROP_SKIP_INSTALL === '1';

// Find the repo root (works whether run via npx, npm, or directly)
function findRepoRoot() {
  let dir = __dirname;
  while (dir !== '/') {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.name === '@hfsp-labs/clawdrop') {
        return dir;
      }
    }
    dir = path.dirname(dir);
  }
  // Fallback: assume we're in packages/clawdrop-mcp/
  return path.resolve(__dirname, '..', '..');
}

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MCP_DIR = path.resolve(REPO_ROOT, 'packages', 'clawdrop-mcp');
const API_ENTRY = path.join(MCP_DIR, 'dist', 'api-server.js');
const MCP_PACKAGE_JSON = path.join(MCP_DIR, 'package.json');
const NODE_MODULES = path.join(MCP_DIR, 'node_modules');
const ENV_FILE = path.join(MCP_DIR, '.env');

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

async function checkApiRunning() {
  return new Promise(resolve => {
    const req = http.get('http://localhost:3000/health', { timeout: 2000 }, res => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function installDependencies() {
  if (SKIP_INSTALL) return;
  if (fs.existsSync(NODE_MODULES)) return;
  
  console.log('📦 First run: installing dependencies (this takes ~30s)...');
  console.log('   Only installing API server deps, not the full monorepo');
  
  try {
    execSync('npm install --production', {
      cwd: MCP_DIR,
      stdio: 'inherit',
      timeout: 120000
    });
    console.log('✅ Dependencies installed\n');
  } catch (err) {
    console.error('❌ Install failed. Try manual install:');
    console.error(`   cd ${MCP_DIR} && npm install`);
    process.exit(1);
  }
}

async function startApiServer() {
  const isRunning = await checkApiRunning();
  if (isRunning) {
    console.log('✅ API server already running on port 3000\n');
    return;
  }

  console.log('🚀 Starting Clawdrop API server...');
  
  // Check for .env
  if (!fs.existsSync(ENV_FILE)) {
    const envContent = `HELIUS_API_KEY=7297b07c-c4d0-46f4-b8f7-242c25005e9c
HELIUS_DEVNET_RPC=https://devnet.helius-rpc.com/?api-key=7297b07c-c4d0-46f4-b8f7-242c25005e9c
CLAWDROP_WALLET_ADDRESS=3TyBTeqqN5NpMicX6JXAVAHqUyYLqSNz4EMtQxM34yMw
HFSP_API_URL=http://localhost:3001
HFSP_API_KEY=test-dev-key-12345
PORT=3000
NODE_ENV=production
`;
    fs.writeFileSync(ENV_FILE, envContent);
    console.log('⚙️  Created default .env (devnet demo mode)\n');
  }

  // Start API in background
  const apiProcess = spawn('node', [API_ENTRY], {
    cwd: MCP_DIR,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, PORT: '3000', NODE_ENV: 'production' }
  });
  apiProcess.unref();

  // Wait for API to be ready
  let attempts = 0;
  while (attempts < 15) {
    await sleep(500);
    if (await checkApiRunning()) {
      console.log('✅ API server ready on http://localhost:3000\n');
      return;
    }
    attempts++;
  }
  
  console.error('❌ API server failed to start. Check logs:');
  console.error(`   node ${API_ENTRY}`);
  process.exit(1);
}

function makeRequest(path, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve({ raw: body }); }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function printBox(title, content) {
  const width = 60;
  const line = '═'.repeat(width);
  console.log(`\n╔${line}╗`);
  console.log(`║${title.padStart((width + title.length) / 2).padEnd(width)}║`);
  console.log(`╠${line}╣`);
  const lines = content.split('\n');
  lines.forEach(l => {
    if (l.length > width - 2) {
      for (let i = 0; i < l.length; i += width - 4) {
        const chunk = l.slice(i, i + width - 4);
        console.log(`║ ${chunk.padEnd(width - 2)}║`);
      }
    } else {
      console.log(`║ ${l.padEnd(width - 2)}║`);
    }
  });
  console.log(`╚${line}╝\n`);
}

// ─── DEMO MODE ──────────────────────────────────────────────────────────────

async function demoMode() {
  console.clear();
  console.log('🐾 Clawdrop - Deploy OpenClaw Agent\n');
  console.log('═══════════════════════════════════════════════');
  console.log('  DEMO MODE - Simulated Interactive Deployment');
  console.log('═══════════════════════════════════════════════\n');

  const selectedTier = 'tier_a';
  const llmProvider = 'anthropic';
  const selectedToken = 'SOL';
  const tierName = 'Starter';
  const walletAddress = 'HFSPdemo' + Date.now();

  console.log('📦 [Step 1/6] Which tier do you want?');
  console.log('   1) Hobbyist  2) Production ⭐  3) Enterprise');
  await sleep(800);
  console.log('   → Selecting: 2 (Production)\n');
  await sleep(500);

  console.log('🤖 [Step 2/6] Which AI model provider?');
  console.log('   1) Anthropic (Claude)  2) OpenAI (GPT)  3) OpenRouter');
  await sleep(800);
  console.log('   → Selecting: 1 (Anthropic)\n');
  await sleep(500);

  console.log('💰 [Step 3/6] Which payment token?');
  console.log('   1) SOL  2) USDC  3) HERD  4) EURC');
  await sleep(800);
  console.log('   → Selecting: 1 (SOL)\n');
  await sleep(500);

  const step2 = await makeRequest('/api/tools/start_deployment_walkthrough', {
    step: 2, selected_tier: selectedTier, llm_provider: llmProvider, selected_token: selectedToken
  });

  const amount = step2.data?.amount || '0.02';
  const paymentWallet = step2.data?.payment_address || '3TyBTeqqN5NpMicX6JXAVAHqUyYLqSNz4EMtQxM34yMw';

  printBox('💵 [Step 4/6] Price Quote',
    `Tier: ${tierName}\nLLM: ${llmProvider}\nPayment: ${amount} ${selectedToken}\nNetwork: Solana Testnet (devnet)\n\nSend payment to:\n${paymentWallet}\n\nAmount: ${amount} ${selectedToken}`
  );

  console.log('📡 Watching blockchain for payment...');
  await sleep(1500);
  console.log('⏳ Waiting...');
  await sleep(1000);
  
  const step3 = await makeRequest('/api/tools/start_deployment_walkthrough', {
    step: 3, selected_tier: selectedTier, llm_provider: llmProvider, selected_token: selectedToken,
    owner_wallet: walletAddress
  });

  const detectedTx = step3.data?.detected_tx || 'devnet_demo_tx_' + Date.now();
  if (step3.success && step3.data?.detected_tx) {
    console.log(`✓ Payment detected! TX: ${detectedTx.slice(0, 20)}...\n`);
  }

  console.log('🤖 [Step 5/6] Telegram Integration (Optional)');
  await sleep(800);
  console.log('   → Skipping (press Enter to skip)\n');
  await sleep(500);

  console.log('🚀 [Step 6/6] Deploying your agent...');
  await sleep(500);
  console.log('   ⏳ Verifying payment...'); await sleep(800);
  console.log('   ✓ Payment verified'); await sleep(400);
  console.log('   ⏳ Creating subscription...'); await sleep(800);
  console.log('   ✓ Subscription active'); await sleep(400);
  console.log('   ⏳ Provisioning agent...'); await sleep(1200);

  const step4 = await makeRequest('/api/tools/start_deployment_walkthrough', {
    step: 4, selected_tier: selectedTier, llm_provider: llmProvider, selected_token: selectedToken,
    owner_wallet: walletAddress, agent_name: 'DemoAgent', detected_tx: detectedTx
  });

  if (!step4.success) {
    console.log('   ❌ Deployment failed:', step4.error);
    return;
  }

  console.log('   ✓ Agent deployed!'); await sleep(300);

  printBox('✅ SUCCESS - Your Agent Is Live!',
    `Agent ID: ${step4.data?.agent_id}\nTier: ${tierName}\nLLM: ${llmProvider}\nStatus: ${step4.data?.status} ✓\n\nWhat's next:\n1. Open Claude Code\n2. get_deployment_status ${step4.data?.agent_id}\n3. send_agent_message ${step4.data?.agent_id}\n\n🎉 Your agent is ready on devnet!`
  );
}

// ─── INTERACTIVE MODE ───────────────────────────────────────────────────────

async function interactiveMode() {
  console.clear();
  console.log('🐾 Clawdrop - Deploy OpenClaw Agent\n');

  try {
    console.log('[Step 0] Getting available tiers...');
    const step0 = await makeRequest('/api/tools/start_deployment_walkthrough', { step: 0 });
    
    if (!step0.success) {
      console.error('❌ API Error:', step0.error);
      process.exit(1);
    }

    console.log('\n📦 Available Tiers:');
    console.log('   1) 🌱 Explorer     - $29/mo  (Shared, experiments)');
    console.log('   2) Tier A - Starter - $100/mo (Shared, prototypes)');
    console.log('   3) Tier B - Pro ⭐  - $200/mo (Dedicated, production)');
    console.log('   4) Tier C - Enterprise - $400/mo (Custom)\n');

    const tierChoice = await ask('📦 [Step 1/5] Which tier? (1-4, default: 3): ');
    const tierMap = { '1': 'tier_explorer', '2': 'tier_a', '3': 'tier_b', '4': 'tier_c' };
    const selectedTier = tierMap[tierChoice.trim()] || 'tier_b';
    const tierName = { tier_explorer: 'Explorer', tier_a: 'Starter', tier_b: 'Professional', tier_c: 'Enterprise' }[selectedTier];
    console.log(`✓ Selected: ${tierName}\n`);

    console.log('💰 [Step 2/5] Which payment token?');
    console.log('   1) SOL   2) USDC   3) HERD   4) EURC');
    const tokenChoice = await ask('Enter 1-4 (default: 1): ');
    const tokenMap = { '1': 'SOL', '2': 'USDC', '3': 'HERD', '4': 'EURC' };
    const selectedToken = tokenMap[tokenChoice.trim()] || 'SOL';
    console.log(`✓ Selected: ${selectedToken}\n`);

    const step2 = await makeRequest('/api/tools/start_deployment_walkthrough', {
      step: 2, selected_tier: selectedTier, selected_token: selectedToken
    });

    const amount = step2.data?.amount || '0.05';
    const paymentWallet = step2.data?.payment_address || '3TyBTeqqN5NpMicX6JXAVAHqUyYLqSNz4EMtQxM34yMw';

    printBox('💵 [Step 3/5] Price Quote',
      `Tier: ${tierName}\nPayment: ${amount} ${selectedToken}\nNetwork: Solana Testnet (devnet)\n\nSend payment to:\n${paymentWallet}\n\nAmount: ${amount} ${selectedToken}\n\nOpen Phantom wallet and send the payment.`
    );

    await ask('\nPress Enter after sending payment...');
    const walletAddress = await ask('Your Solana wallet address: ');

    console.log('\n📡 Watching blockchain for payment...');
    const step3 = await makeRequest('/api/tools/start_deployment_walkthrough', {
      step: 3, selected_tier: selectedTier, selected_token: selectedToken,
      owner_wallet: walletAddress
    });

    let detectedTx;
    if (step3.success && step3.data?.detected_tx) {
      detectedTx = step3.data.detected_tx;
      console.log(`✓ Payment detected! TX: ${detectedTx.slice(0, 20)}...\n`);
    } else {
      const manualTx = await ask('Enter transaction hash manually (or Enter to abort): ');
      if (!manualTx.trim()) { console.log('Cancelled.'); process.exit(0); }
      detectedTx = manualTx.trim();
    }

    const telegramToken = await ask('🤖 [Step 4/5] Telegram bot token from @BotFather (or Enter to skip): ');
    if (telegramToken.trim()) console.log('✓ Telegram configured\n');
    else console.log('✓ Skipping Telegram\n');

    console.log('🚀 [Step 5/5] Deploying your agent...');
    const agentName = await ask('Agent name (default: MyOpenClaw): ') || 'MyOpenClaw';

    const step4 = await makeRequest('/api/tools/start_deployment_walkthrough', {
      step: 4, selected_tier: selectedTier, selected_token: selectedToken,
      owner_wallet: walletAddress, agent_name: agentName,
      detected_tx: detectedTx, telegram_token: telegramToken.trim() || undefined
    });

    if (!step4.success) {
      console.error('❌ Deployment failed:', step4.error);
      process.exit(1);
    }

    const { agent_id, status, telegram_enabled } = step4.data;

    printBox('✅ SUCCESS - Your Agent Is Live!',
      `Agent ID: ${agent_id}\nTier: ${tierName}\nStatus: ${status}` +
      (telegram_enabled ? '\nTelegram: Enabled ✓' : '') +
      `\n\nWhat's next:\n- Check status: get_deployment_status ${agent_id}\n- Send message: send_agent_message ${agent_id}` +
      (telegram_enabled ? '\n- Message your bot on Telegram' : '')
    );

    console.log('🎉 Done! Your agent is ready on devnet.\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// ─── MAIN ───────────────────────────────────────────────────────────────────

async function main() {
  // Setup
  await installDependencies();
  await startApiServer();

  // Run mode
  if (DEMO_MODE) await demoMode();
  else await interactiveMode();

  rl.close();
}

main();
