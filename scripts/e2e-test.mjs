#!/usr/bin/env node
/**
 * E2E Test Script for HFSP Labs Monorepo
 * Tests the full flow: tier listing → quote → deploy → status
 */

import axios from 'axios';
import chalk from 'chalk';

const CLAWDROP_MCP_URL = process.env.CLAWDROP_MCP_URL || 'http://localhost:3000';
const STOREFRONT_BOT_URL = process.env.STOREFRONT_BOT_URL || 'http://localhost:3001';

// Test results
const results = [];

function log(section, message, type = 'info') {
  const color = type === 'success' ? chalk.green : type === 'error' ? chalk.red : type === 'warn' ? chalk.yellow : chalk.blue;
  console.log(`${chalk.cyan(`[${section}]`)} ${color(message)}`);
}

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, status: '✅ PASS' });
    log('TEST', `${name}: PASS`, 'success');
  } catch (err) {
    results.push({ name, status: '❌ FAIL', error: err.message });
    log('TEST', `${name}: FAIL - ${err.message}`, 'error');
  }
}

// Test 1: Health checks
async function testHealthChecks() {
  log('E2E', 'Testing health endpoints...');
  
  const [mcpHealth, storefrontHealth] = await Promise.all([
    axios.get(`${CLAWDROP_MCP_URL}/health`).catch(() => ({ status: 500 })),
    axios.get(`${STOREFRONT_BOT_URL}/health`).catch(() => ({ status: 500 })),
  ]);
  
  if (mcpHealth.status !== 200) {
    throw new Error(`Clawdrop MCP health check failed: ${mcpHealth.status}`);
  }
  if (storefrontHealth.status !== 200) {
    throw new Error(`Storefront Bot health check failed: ${storefrontHealth.status}`);
  }
}

// Test 2: List tiers
async function testListTiers() {
  log('E2E', 'Testing list_tiers...');
  
  const response = await axios.post(`${CLAWDROP_MCP_URL}/mcp/v1/call`, {
    tool: 'list_tiers',
    input: {}
  });
  
  const result = response.data?.result;
  if (!result || !result.tiers || result.tiers.length === 0) {
    throw new Error('No tiers returned');
  }
  
  log('E2E', `Found ${result.tiers.length} tiers`, 'success');
}

// Test 3: Quote tier
async function testQuoteTier() {
  log('E2E', 'Testing quote_tier...');
  
  const response = await axios.post(`${CLAWDROP_MCP_URL}/mcp/v1/call`, {
    tool: 'quote_tier',
    input: {
      tier_id: 'tier_a',
      payment_token: 'SOL'
    }
  });
  
  const result = response.data?.result;
  if (!result || !result.price_in_token) {
    throw new Error('Quote failed');
  }
  
  log('E2E', `Quoted: ${result.price_in_token} SOL`, 'success');
}

// Test 4: Birdeye token analytics
async function testTokenAnalytics() {
  log('E2E', 'Testing get_token_analytics...');
  
  const response = await axios.post(`${CLAWDROP_MCP_URL}/mcp/v1/call`, {
    tool: 'get_token_analytics',
    input: {
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' // USDC
    }
  });
  
  const result = response.data?.result;
  if (!result || !result.mint) {
    throw new Error('Token analytics failed');
  }
  
  log('E2E', `Token: ${result.symbol || 'UNKNOWN'} @ $${result.price_usd || 0}`, 'success');
}

// Test 5: Risk check
async function testRiskCheck() {
  log('E2E', 'Testing check_token_risk...');
  
  const response = await axios.post(`${CLAWDROP_MCP_URL}/mcp/v1/call`, {
    tool: 'check_token_risk',
    input: {
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      action: 'swap',
      amount: 100
    }
  });
  
  const result = response.data?.result;
  if (!result || !result.decision) {
    throw new Error('Risk check failed');
  }
  
  log('E2E', `Risk: ${result.risk_tier} - ${result.decision}`, 'success');
}

// Test 6: Market overview
async function testMarketOverview() {
  log('E2E', 'Testing get_market_overview...');
  
  const response = await axios.post(`${CLAWDROP_MCP_URL}/mcp/v1/call`, {
    tool: 'get_market_overview',
    input: {}
  });
  
  const result = response.data?.result;
  if (!result || !Array.isArray(result.tokens)) {
    throw new Error('Market overview failed');
  }
  
  log('E2E', `Market: ${result.count} trending tokens`, 'success');
}

// Main runner
async function main() {
  console.log(chalk.bold('\n🧪 HFSP Labs E2E Test Suite\n'));
  
  await test('Health Checks', testHealthChecks);
  await test('List Tiers', testListTiers);
  await test('Quote Tier', testQuoteTier);
  await test('Token Analytics (Birdeye)', testTokenAnalytics);
  await test('Risk Check (DD.xyz)', testRiskCheck);
  await test('Market Overview (Birdeye)', testMarketOverview);
  
  // Summary
  console.log(chalk.bold('\n📊 Test Summary\n'));
  const passed = results.filter(r => r.status.includes('PASS')).length;
  const failed = results.filter(r => r.status.includes('FAIL')).length;
  
  results.forEach(r => {
    const color = r.status.includes('PASS') ? chalk.green : chalk.red;
    console.log(`${color(r.status)} ${r.name}`);
    if (r.error) {
      console.log(chalk.gray(`  → ${r.error}`));
    }
  });
  
  console.log(chalk.bold(`\nTotal: ${passed} passed, ${failed} failed\n`));
  
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(chalk.red('Fatal error:'), err);
  process.exit(1);
});
