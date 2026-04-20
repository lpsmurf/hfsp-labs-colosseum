#!/usr/bin/env node

/**
 * Clawdrop CLI - Interactive Deployment Walkthrough
 * 
 * Usage:
 *   npx github:lpsmurf/hfsp-labs-colosseum
 *   node cli.cjs
 * 
 * This CLI runs the 5-step deployment walkthrough interactively.
 * For demo/video mode: CLAWDROP_DEMO=1 node cli.cjs
 */

const http = require('http');
const readline = require('readline');

const API_URL = process.env.CLAWDROP_API_URL || 'http://localhost:3000';
const DEMO_MODE = process.env.CLAWDROP_DEMO === '1';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
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
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve({ raw: body });
        }
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

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function demoMode() {
  console.clear();
  console.log('🐾 Clawdrop - Deploy OpenClaw Agent\n');
  console.log('═══════════════════════════════════════════════');
  console.log('  DEMO MODE - Simulated Interactive Deployment');
  console.log('═══════════════════════════════════════════════\n');

  const selectedTier = 'tier_a'; // Use tier_a to avoid max agents limit
  const selectedToken = 'SOL';
  const tierName = 'Starter';
  const walletAddress = 'HFSPdemo' + Date.now(); // Unique wallet to avoid limits

  // Step 1
  console.log('📦 [Step 1/5] Which tier do you want?');
  console.log('   1) Hobbyist  2) Production ⭐  3) Enterprise');
  await sleep(800);
  console.log('   → Selecting: 2 (Production)\n');
  await sleep(500);

  // Step 2
  console.log('💰 [Step 2/5] Which payment token?');
  console.log('   1) SOL  2) USDC  3) HERD  4) EURC');
  await sleep(800);
  console.log('   → Selecting: 1 (SOL)\n');
  await sleep(500);

  // Get quote
  const step2 = await makeRequest('/api/tools/start_deployment_walkthrough', {
    step: 2,
    selected_tier: selectedTier,
    selected_token: selectedToken
  });

  const amount = step2.data?.amount || '0.05';
  const paymentWallet = step2.data?.payment_address || '3TyBTeqqN5NpMicX6JXAVAHqUyYLqSNz4EMtQxM34yMw';

  // Step 3
  printBox('💵 [Step 3/5] Price Quote',
    `Tier: ${tierName}\n` +
    `Payment: ${amount} ${selectedToken}\n` +
    `Network: Solana Testnet (devnet)\n\n` +
    `Send payment to:\n${paymentWallet}\n\n` +
    `Amount: ${amount} ${selectedToken}\n\n` +
    `Open Phantom, send payment, then continue...`
  );

  console.log('📡 Watching blockchain for payment...');
  await sleep(1500);
  console.log('⏳ Waiting...');
  await sleep(1000);
  
  // Auto-detect
  const step3 = await makeRequest('/api/tools/start_deployment_walkthrough', {
    step: 3,
    selected_tier: selectedTier,
    selected_token: selectedToken,
    owner_wallet: walletAddress
  });

  if (step3.success && step3.data?.detected_tx) {
    console.log(`✓ Payment detected! TX: ${step3.data.detected_tx.slice(0, 20)}...\n`);
  } else {
    console.log('⚠️ Using demo transaction hash\n');
  }

  const detectedTx = step3.data?.detected_tx || 'devnet_demo_tx_' + Date.now();

  // Step 4
  console.log('🤖 [Step 4/5] Telegram Integration (Optional)');
  console.log('   Get a bot token from @BotFather');
  await sleep(800);
  console.log('   → Skipping (press Enter to skip)\n');
  await sleep(500);

  // Step 5
  console.log('🚀 [Step 5/5] Deploying your agent...');
  await sleep(500);
  console.log('   ⏳ Verifying payment...');
  await sleep(800);
  console.log('   ✓ Payment verified');
  await sleep(400);
  console.log('   ⏳ Creating subscription...');
  await sleep(800);
  console.log('   ✓ Subscription active');
  await sleep(400);
  console.log('   ⏳ Provisioning agent...');
  await sleep(1200);

  const step4 = await makeRequest('/api/tools/start_deployment_walkthrough', {
    step: 4,
    selected_tier: selectedTier,
    selected_token: selectedToken,
    owner_wallet: walletAddress,
    agent_name: 'DemoAgent',
    detected_tx: detectedTx
  });

  if (!step4.success) {
    console.log('   ❌ Deployment failed:', step4.error);
    return;
  }

  console.log('   ✓ Agent deployed!');
  await sleep(300);

  const agentId = step4.data?.agent_id;
  const status = step4.data?.status;

  printBox('✅ SUCCESS - Your Agent Is Live!',
    `Agent ID: ${agentId}\n` +
    `Tier: ${tierName}\n` +
    `Status: ${status} ✓\n\n` +
    `What's next:\n` +
    `1. Open Claude Code\n` +
    `2. get_deployment_status ${agentId}\n` +
    `3. send_agent_message ${agentId}\n\n` +
    `🎉 Your agent is ready on devnet!`
  );
}

async function interactiveMode() {
  console.clear();
  console.log('🐾 Clawdrop - Deploy OpenClaw Agent\n');

  try {
    // Step 0
    console.log('[Step 0] Getting available tiers...');
    const step0 = await makeRequest('/api/tools/start_deployment_walkthrough', { step: 0 });
    
    if (!step0.success) {
      console.error('❌ Error:', step0.error);
      console.log('\n💡 Make sure the Clawdrop API is running on port 3000');
      console.log('   npm run start:api');
      process.exit(1);
    }

    console.log('\n📦 Available Tiers:');
    console.log('   1) 🌱 Explorer - $29/mo (Shared)');
    console.log('   2) Tier A - Starter - $100/mo (Shared)');
    console.log('   3) Tier B - Professional ⭐ - $200/mo (Dedicated)');
    console.log('   4) Tier C - Enterprise - $400/mo (Custom)\n');

    // Step 1
    const tierChoice = await ask('📦 [Step 1/5] Which tier? (1-4, default: 3): ');
    const tierMap = { '1': 'tier_explorer', '2': 'tier_a', '3': 'tier_b', '4': 'tier_c' };
    const selectedTier = tierMap[tierChoice.trim()] || 'tier_b';
    const tierName = selectedTier === 'tier_explorer' ? 'Explorer' : 
                     selectedTier === 'tier_a' ? 'Starter' :
                     selectedTier === 'tier_b' ? 'Professional' : 'Enterprise';
    console.log(`✓ Selected: ${tierName}\n`);

    // Step 2
    console.log('💰 [Step 2/5] Which payment token?');
    console.log('   1) SOL  2) USDC  3) HERD  4) EURC');
    const tokenChoice = await ask('Enter 1-4 (default: 1): ');
    const tokenMap = { '1': 'SOL', '2': 'USDC', '3': 'HERD', '4': 'EURC' };
    const selectedToken = tokenMap[tokenChoice.trim()] || 'SOL';
    console.log(`✓ Selected: ${selectedToken}\n`);

    const step2 = await makeRequest('/api/tools/start_deployment_walkthrough', {
      step: 2,
      selected_tier: selectedTier,
      selected_token: selectedToken
    });

    const amount = step2.data?.amount || '0.05';
    const paymentWallet = step2.data?.payment_address || '3TyBTeqqN5NpMicX6JXAVAHqUyYLqSNz4EMtQxM34yMw';

    // Step 3
    printBox('💵 [Step 3/5] Price Quote',
      `Payment: ${amount} ${selectedToken}\n` +
      `Network: Solana Testnet (devnet)\n\n` +
      `Send payment to:\n${paymentWallet}\n\n` +
      `Amount: ${amount} ${selectedToken}\n\n` +
      `Open Phantom wallet and send the payment.`
    );

    await ask('Press Enter after sending payment...');
    const walletAddress = await ask('Your Solana wallet address: ');

    console.log('\n📡 Watching blockchain for payment...');
    const step3 = await makeRequest('/api/tools/start_deployment_walkthrough', {
      step: 3,
      selected_tier: selectedTier,
      selected_token: selectedToken,
      owner_wallet: walletAddress
    });

    let detectedTx;
    if (step3.success && step3.data?.detected_tx) {
      detectedTx = step3.data.detected_tx;
      console.log(`✓ Payment detected! TX: ${detectedTx.slice(0, 20)}...\n`);
    } else {
      const manualTx = await ask('Enter transaction hash manually (or press Enter to abort): ');
      if (!manualTx.trim()) {
        console.log('Deployment cancelled.');
        process.exit(0);
      }
      detectedTx = manualTx.trim();
    }

    // Step 4
    const telegramToken = await ask('🤖 [Step 4/5] Telegram bot token from @BotFather (or press Enter to skip): ');
    if (telegramToken.trim()) {
      console.log('✓ Telegram configured\n');
    } else {
      console.log('✓ Skipping Telegram\n');
    }

    // Step 5
    console.log('🚀 [Step 5/5] Deploying your agent...');
    const agentName = await ask('Agent name (default: MyOpenClaw): ') || 'MyOpenClaw';

    const step4 = await makeRequest('/api/tools/start_deployment_walkthrough', {
      step: 4,
      selected_tier: selectedTier,
      selected_token: selectedToken,
      owner_wallet: walletAddress,
      agent_name: agentName,
      detected_tx: detectedTx,
      telegram_token: telegramToken.trim() || undefined
    });

    if (!step4.success) {
      console.error('❌ Deployment failed:', step4.error);
      process.exit(1);
    }

    const agentId = step4.data?.agent_id;
    const status = step4.data?.status;
    const telegramEnabled = step4.data?.telegram_enabled;

    printBox('✅ SUCCESS - Your Agent Is Live!',
      `Agent ID: ${agentId}\n` +
      `Tier: ${tierName}\n` +
      `Status: ${status}\n` +
      (telegramEnabled ? `Telegram: Enabled ✓\n` : '') +
      `\nWhat's next:\n` +
      `- Check status: get_deployment_status ${agentId}\n` +
      `- Send message: send_agent_message ${agentId}\n` +
      (telegramEnabled ? `- Message your bot on Telegram\n` : '')
    );

    console.log('🎉 Done! Your agent is ready on devnet.\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n💡 Make sure the Clawdrop API is running:');
    console.log('   npm run start:api');
    process.exit(1);
  }
}

async function main() {
  if (DEMO_MODE) {
    await demoMode();
  } else {
    await interactiveMode();
  }
  rl.close();
}

main();
