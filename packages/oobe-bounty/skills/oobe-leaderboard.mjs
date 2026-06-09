#!/usr/bin/env node
/**
 * OOBE Bounty Leaderboard
 * Usage: node oobe-leaderboard.mjs [hours]
 *   hours = 0 or omit for all-time, 48 for last 48h, 24 for last 24h
 */
const HELIUS_KEY = process.env.HELIUS_API_KEY ?? 'b72c1253-4c5d-441b-8b54-46b08d10d447';
const HELIUS_BASE = `https://api.helius.xyz/v0`;
const FACILITATOR = '5iVXFrYaYWX2GUTbkQj8mDBoBhAX8bneYigS2LJTia43';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SAP_AGENTS_API = 'https://explorer.oobeprotocol.ai/api/sap/agents?limit=200';
const WINDOW_HOURS = parseInt(process.argv[2] ?? '0') || 0;

async function fetchAgents() {
  const res = await fetch(SAP_AGENTS_API);
  const data = await res.json();
  return data.agents.map(a => ({
    name: a.identity?.name ?? 'Unknown',
    wallet: a.identity?.wallet ?? '',
  })).filter(a => a.wallet);
}

async function fetchWithRetry(url, retries = 5) {
  let delay = 1000;
  for (let i = 0; i <= retries; i++) {
    const res = await fetch(url);
    const body = await res.json();
    if (res.status === 429 || (body?.error?.code === -32429)) {
      if (i === retries) return [];
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
      continue;
    }
    return Array.isArray(body) ? body : [];
  }
  return [];
}

async function getPayments(wallet, sinceTs = 0) {
  let count = 0, volume = 0, cursor;
  while (true) {
    const url = `${HELIUS_BASE}/addresses/${wallet}/transactions?api-key=${HELIUS_KEY}&limit=100&type=TRANSFER${cursor ? '&before=' + cursor : ''}`;
    const txs = await fetchWithRetry(url);
    if (txs.length === 0) break;
    let pastWindow = false;
    for (const tx of txs) {
      if (sinceTs && tx.timestamp < sinceTs) { pastWindow = true; continue; }
      for (const t of (tx.tokenTransfers ?? [])) {
        if (t.mint === USDC_MINT && t.toUserAccount === FACILITATOR) {
          count++;
          volume += t.tokenAmount ?? 0;
        }
      }
    }
    cursor = txs[txs.length - 1]?.signature;
    if (txs.length < 100 || pastWindow) break;
    await new Promise(r => setTimeout(r, 400));
  }
  return { count, volume };
}

const sinceTs = WINDOW_HOURS ? Math.floor(Date.now() / 1000) - WINDOW_HOURS * 3600 : 0;
const label = WINDOW_HOURS ? `Last ${WINDOW_HOURS}h` : 'All time';

console.log(`\nOOBE Bounty Leaderboard — ${label}`);
console.log(`${new Date().toISOString()}`);
console.log(`Facilitator: ${FACILITATOR}\n`);

const agents = await fetchAgents();
const seen = new Set();
const results = [];

for (const { name, wallet } of agents) {
  if (seen.has(name)) continue;
  seen.add(name);
  process.stdout.write(`  scanning ${name.slice(0, 24).padEnd(24)}\r`);
  const { count, volume } = await getPayments(wallet, sinceTs);
  results.push({ name, count, volume });
  await new Promise(r => setTimeout(r, 300));
}

process.stdout.write(' '.repeat(50) + '\r');
results.sort((a, b) => b.count - a.count || b.volume - a.volume);
const active = results.filter(r => r.count > 0);

console.log(`RANK  ${'AGENT'.padEnd(32)}  ${'TXNS'.padStart(5)}  ${'USDC'.padStart(10)}`);
console.log('─'.repeat(58));
active.forEach(({ name, count, volume }, i) => {
  console.log(`${String(i + 1).padStart(4)}  ${name.slice(0, 32).padEnd(32)}  ${String(count).padStart(5)}  $${volume.toFixed(4).padStart(9)}`);
});
if (active.length === 0) console.log('  No on-chain payments found in this window.');
console.log('─'.repeat(58));
console.log(`Active: ${active.length} / ${results.length} registered agents have on-chain payments`);
