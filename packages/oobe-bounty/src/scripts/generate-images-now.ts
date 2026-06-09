/**
 * One-shot script: generate 3 Ace Data Cloud images based on today's crypto news.
 * Each image triggers an x402 payment on Solana and is recorded in the DB.
 *
 * Usage: npx tsx src/scripts/generate-images-now.ts
 */

import { initializeDatabase } from '../db/schema.js';
import { createAceClient } from '../services/ace-client.js';
import { getAndClearLastX402Signature, extractX402Hash, recordX402Payment } from '../services/x402-payments.js';
import { insertSignal } from '../db/migrations.js';
import { loadConfig } from '../config.js';

// Synapse RPC is rate-exhausted; use Helius for this run.
// Payments still go to AceDataCloud's facilitator on Solana mainnet.
process.env.SYNAPSE_RPC_URL = process.env.SOLANA_MAINNET_RPC ?? process.env.SYNAPSE_RPC_URL;

const IMAGES: Array<{ symbol: string; theme: string; headline: string }> = [
  {
    symbol: 'BTC',
    theme: 'gold bullish',
    headline: 'Bitcoin breaks above key resistance as institutional demand surges in June 2026',
  },
  {
    symbol: 'SOL',
    theme: 'purple electric',
    headline: 'Solana DeFi TVL hits all-time high as ecosystem growth accelerates',
  },
  {
    symbol: 'ETH',
    theme: 'blue futuristic',
    headline: 'Ethereum L2 transaction volume surpasses mainnet for the first time ever',
  },
];

async function main() {
  const config = loadConfig();
  const db = await initializeDatabase(config.databasePath);
  const ace = createAceClient();

  console.log('[images] Starting 3-image generation run...\n');

  for (const { symbol, theme, headline } of IMAGES) {
    console.log(`[images] Generating ${symbol} image — "${headline.slice(0, 60)}..."`);

    const prompt = `Professional crypto news card, dark background, ${theme} color scheme. Large bold ticker: "${symbol}/USD". Today's headline: "${headline}". Clawdrop AI branding, minimal design, no people, no faces. 2026 aesthetic.`;

    let x402Hash: string | null = null;
    let imageUrl: string | null = null;

    try {
      const taskOrResult = (await ace.images.generate({
        prompt,
        provider: 'flux',
        size: '1024x1024',
      })) as Record<string, unknown> & {
        wait?: () => Promise<Record<string, unknown>>;
      };
      const result = typeof taskOrResult.wait === 'function' ? await taskOrResult.wait() : taskOrResult;
      x402Hash = getAndClearLastX402Signature() ?? extractX402Hash(result);
      imageUrl = (result.image_url ?? result.url ?? result.imageUrl ?? null) as string | null;
    } catch (err) {
      // Payment may have gone through even if the image API returned an error.
      // Capture the signature so we don't lose the on-chain record.
      x402Hash = getAndClearLastX402Signature() ?? x402Hash;
      console.warn(`[images] API error for ${symbol} (payment still recorded):`, err instanceof Error ? err.message : err);
    }

    // Always record payment + signal if a payment was made
    if (x402Hash) {
      recordX402Payment('sentiment-monitor', 'images', x402Hash, db);
      insertSignal(db, {
        agentId: 'sentiment-monitor',
        service: 'images',
        action: 'HOLD',
        symbol,
        target_price: 0,
        confidence: 0.75,
        reason: `Daily news image: ${headline}`,
        risk_level: 'LOW',
        actual_price: 0,
        timestamp: new Date().toISOString(),
        image_url: imageUrl,
        headlines: null,
      });
      console.log(`[images] ✓ ${symbol} — tx: ${x402Hash} | img: ${imageUrl ?? 'pending'}\n`);
    } else {
      console.error(`[images] ✗ ${symbol} — no payment confirmed, skipping DB record\n`);
    }

    await new Promise(r => setTimeout(r, 3000));
  }

  console.log('[images] All 3 images complete. Checking DB...');

  const rows = (db.prepare(
    `SELECT agent_id, service, tx_signature, created_at FROM payments WHERE service = 'images' ORDER BY created_at DESC LIMIT 5`
  ).all()) as Array<{ agent_id: string; service: string; tx_signature: string; created_at: string }>;

  console.log('\n=== Latest images x402 payments ===');
  for (const r of rows) {
    console.log(`  ${r.created_at}  ${r.service}  ${r.tx_signature ?? 'NO HASH'}`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('[images] Fatal:', err);
  process.exit(1);
});
