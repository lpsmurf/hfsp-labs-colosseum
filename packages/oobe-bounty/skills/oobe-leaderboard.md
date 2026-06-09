# OOBE Bounty Leaderboard

## Description
Pulls the live OOBE × Ace Data Cloud bounty leaderboard by querying on-chain USDC payments from every SAP-registered wallet to the AceDataCloud payment facilitator (`5iVXFrYaYWX2GUTbkQj8mDBoBhAX8bneYigS2LJTia43`). Shows all-time and 48h rankings.

## Usage
`/oobe-leaderboard` or `/oobe-leaderboard 48h`

## Implementation

Run this with `node`:

```javascript
// oobe-leaderboard.mjs
const HELIUS_KEY = process.env.HELIUS_API_KEY ?? 'b72c1253-4c5d-441b-8b54-46b08d10d447';
const HELIUS_BASE = `https://api.helius.xyz/v0`;
const FACILITATOR = '5iVXFrYaYWX2GUTbkQj8mDBoBhAX8bneYigS2LJTia43';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SAP_AGENTS_API = 'https://explorer.oobeprotocol.ai/api/sap/agents?limit=200';
const WINDOW_HOURS = parseInt(process.argv[2] ?? '0') || 0; // 0 = all time

async function fetchAgents() {
  const res = await fetch(SAP_AGENTS_API);
  const data = await res.json();
  return data.agents.map(a => ({
    name: a.identity?.name ?? 'Unknown',
    wallet: a.identity?.wallet ?? '',
  })).filter(a => a.wallet);
}

async function getPayments(wallet, sinceTs = 0) {
  let count = 0, volume = 0, cursor;
  while (true) {
    const url = `${HELIUS_BASE}/addresses/${wallet}/transactions?api-key=${HELIUS_KEY}&limit=100&type=TRANSFER${cursor ? '&before=' + cursor : ''}`;
    const res = await fetch(url);
    const txs = await res.json();
    if (!Array.isArray(txs) || txs.length === 0) break;
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
    await new Promise(r => setTimeout(r, 250));
  }
  return { count, volume };
}

const sinceTs = WINDOW_HOURS ? Math.floor(Date.now() / 1000) - WINDOW_HOURS * 3600 : 0;
const label = WINDOW_HOURS ? `Last ${WINDOW_HOURS}h` : 'All time';

console.log(`\nOOBE Bounty Leaderboard — ${label}`);
console.log(`Facilitator: ${FACILITATOR}\n`);

const agents = await fetchAgents();
const seen = new Set();
const results = [];

for (const { name, wallet } of agents) {
  if (seen.has(name)) continue;
  seen.add(name);
  const { count, volume } = await getPayments(wallet, sinceTs);
  if (count > 0) results.push({ name, count, volume });
}

results.sort((a, b) => b.count - a.count || b.volume - a.volume);

console.log(`${'RANK'} ${'AGENT'.padEnd(32)} ${'TXNS'.padStart(6)}  ${'USDC'.padStart(10)}`);
console.log('─'.repeat(60));
results.forEach(({ name, count, volume }, i) => {
  console.log(`${String(i+1).padStart(4)} ${name.slice(0,32).padEnd(32)} ${String(count).padStart(6)}  $${volume.toFixed(4).padStart(9)}`);
});
if (results.length === 0) console.log('  No on-chain payments found.');
console.log(`\nTotal active agents: ${results.length} / ${agents.length} registered`);
```

### Quick run (all time)
```bash
node packages/oobe-bounty/skills/oobe-leaderboard.mjs
```

### Last 48 hours
```bash
node packages/oobe-bounty/skills/oobe-leaderboard.mjs 48
```

### Last 24 hours
```bash
node packages/oobe-bounty/skills/oobe-leaderboard.mjs 24
```

## Data Sources
- SAP Agent Registry: `https://explorer.oobeprotocol.ai/api/sap/agents`
- Transaction data: Helius Enhanced Transactions API
- Payment facilitator: `5iVXFrYaYWX2GUTbkQj8mDBoBhAX8bneYigS2LJTia43` (AceDataCloud)
- Token: USDC (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`)
