/**
 * Standalone test runner for distribution bots.
 * Usage: npm run dist:start
 *
 * This script:
 * 1. Loads .env
 * 2. Seeds mock signals into the DB
 * 3. Starts both bots
 * 4. Prints status every 30 seconds
 */

import dotenv from 'dotenv';
dotenv.config();

import { startDistributionService, getDistributionStatus, stopDistributionService } from './index.js';
import { insertMockSignal } from './db.js';

const MOCK_SIGNALS = [
  { action: 'BUY', target_price: 42.5, confidence: 0.85, reason: 'Price up 5%+ in last hour + positive sentiment spike', risk_level: 'LOW', actual_price: 42.0 },
  { action: 'SELL', target_price: 38.2, confidence: 0.72, reason: 'Volume drying up, RSI overbought at 78', risk_level: 'MEDIUM', actual_price: 38.5 },
  { action: 'HOLD', target_price: 40.0, confidence: 0.91, reason: 'Consolidation phase, waiting for breakout', risk_level: 'LOW', actual_price: 40.1 },
  { action: 'BUY', target_price: 55.1, confidence: 0.68, reason: 'Support level bounce + whale accumulation', risk_level: 'HIGH', actual_price: 54.8 },
  { action: 'SELL', target_price: 62.3, confidence: 0.79, reason: 'Bearish divergence on 4h chart', risk_level: 'MEDIUM', actual_price: 62.5 },
];

async function main() {
  const dryRun = process.env.DRY_RUN === 'true';
  console.log('🎯 Clawdrop Distribution Test Runner');
  if (dryRun) {
    console.log('⚠️  DRY RUN mode — no real API calls will be made\n');
  } else {
    console.log('');
  }

  // Seed mock signals
  console.log('Seeding mock signals...');
  for (const sig of MOCK_SIGNALS) {
    insertMockSignal({
      ...sig,
      agent_id: 'price-monitor',
      service: 'price-feed',
      created_at: new Date().toISOString(),
    });
  }
  console.log(`Inserted ${MOCK_SIGNALS.length} mock signals\n`);

  // Start distribution service
  await startDistributionService();

  // Print status every 30s
  const interval = setInterval(async () => {
    try {
      const status = await getDistributionStatus();
      console.log('\n--- Distribution Status ---');
      console.log(`Twitter:  running=${status.twitter.running} posts=${status.twitter.posts} followers=${status.twitter.followers}`);
      console.log(`Telegram: running=${status.telegram.running} msgs=${status.telegram.messages} members=${status.telegram.members}`);
      console.log(`Next poll: ${new Date(status.nextPollTime * 1000).toISOString()}`);
      console.log('---------------------------\n');
    } catch (err) {
      console.error('Status error:', err);
    }
  }, 30000);

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    clearInterval(interval);
    stopDistributionService();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    clearInterval(interval);
    stopDistributionService();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
