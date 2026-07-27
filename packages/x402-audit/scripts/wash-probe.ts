#!/usr/bin/env npx tsx
/**
 * wash-probe — on-chain wash-trading detector for an EVM (Base) ERC-20.
 *
 * Pulls every Transfer event for a token over a time window directly from a
 * public Base RPC (no API key), auto-detects the liquidity/pool/router side,
 * classifies each trader's buys vs sells, and scores the activity:
 *
 *   - trader concentration   (top-5 share, HHI)            — few wallets = suspect
 *   - round-trip churn        (same wallet buys AND sells)  — the core wash signal
 *   - net vs gross            (volume that moves no real position)
 *   - circular EOA→EOA flows  (A→B→A token shuffling)
 *   - on-chain vs reported    (does swap volume reconcile with the listed 24h?)
 *
 * It does NOT claim fraud — it produces evidence + a calibrated verdict
 * (ORGANIC / MIXED / WASH-SUSPECT). Market-makers legitimately round-trip, so
 * a high churn alone is "suspect", not "guilty".
 *
 * Usage:
 *   npx tsx wash-probe.ts --token 0x5f98...dba3 [--hours 24] [--symbol GITLAWB]
 */

const RPCS = [
  'https://base-rpc.publicnode.com',
  'https://mainnet.base.org',
];
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const CHUNK = 3000;            // blocks per getLogs call (public-RPC safe)
const BLOCK_SEC = 2;           // Base ~2s blocks
const ZERO = '0x0000000000000000000000000000000000000000';

interface Xfer { from: string; to: string; value: number; block: number; }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function rpc(method: string, params: unknown[]): Promise<any> {
  let lastErr: unknown;
  for (const url of RPCS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(20_000),
      });
      const j = await res.json();
      if (j.error) { lastErr = j.error; continue; }
      return j.result;
    } catch (e) { lastErr = e; }
  }
  throw new Error(`rpc ${method} failed: ${JSON.stringify(lastErr)}`);
}

const addr = (topic: string) => '0x' + topic.slice(-40).toLowerCase();
const toNum = (hexData: string, decimals = 18) =>
  Number(BigInt(hexData)) / 10 ** decimals;

async function geckoMeta(token: string): Promise<{ priceUsd: number; vol24: number; symbol: string; liq: number } | null> {
  try {
    const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/base/tokens/${token}`, {
      headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000),
    });
    const j = await r.json();
    const a = j?.data?.attributes;
    if (!a) return null;
    return {
      priceUsd: parseFloat(a.price_usd),
      vol24: parseFloat(a.volume_usd?.h24 ?? '0'),
      symbol: a.symbol,
      liq: parseFloat(a.total_reserve_in_usd ?? '0'),
    };
  } catch { return null; }
}

const BLOCKSCOUT = 'https://base.blockscout.com';
const INFRA_NAME = /aggregat|router|universal|permit2|relay|swap|paymaster|entrypoint|multicall|0x\s*protocol|bundler|settle|position\s*manager|forwarder|adapter|hook|nonfungible|gpv2/i;
const CEX_NAME = /coinbase|binance|okx|kraken|bybit|kucoin|gate\.io|crypto\.com|bitget|mexc|exchange|hot\s*wallet/i;

interface Origin { kind: 'contract' | 'eoa' | 'unknown'; name?: string; origin?: string; originName?: string; infra: boolean; }

async function traceAddress(a: string): Promise<Origin> {
  try {
    const r = await fetch(`${BLOCKSCOUT}/api/v2/addresses/${a}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
    const d: any = await r.json();
    const name: string | undefined = d?.name ?? undefined;
    const infra = !!name && INFRA_NAME.test(name);
    if (d?.is_contract) {
      const creator = d?.creator_address_hash?.toLowerCase();
      return { kind: 'contract', name, origin: creator, infra };
    }
    // EOA → first inbound funding tx
    const tx = await fetch(`${BLOCKSCOUT}/api?module=account&action=txlist&address=${a}&sort=asc&page=1&offset=20`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
    const td: any = await tx.json();
    let funder: string | undefined;
    for (const t of td?.result ?? []) {
      if ((t.to ?? '').toLowerCase() === a && BigInt(t.value) > 0n) { funder = (t.from ?? '').toLowerCase(); break; }
    }
    return { kind: 'eoa', name, origin: funder, infra };
  } catch { return { kind: 'unknown', infra: false }; }
}

async function labelOf(a: string): Promise<string | undefined> {
  try {
    const r = await fetch(`${BLOCKSCOUT}/api/v2/addresses/${a}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12_000) });
    const d: any = await r.json();
    return d?.name ?? undefined;
  } catch { return undefined; }
}

async function main() {
  const args = process.argv.slice(2);
  const token = (args[args.indexOf('--token') + 1] || '').toLowerCase();
  const hours = parseFloat(args.includes('--hours') ? args[args.indexOf('--hours') + 1] : '24');
  let symbol = args.includes('--symbol') ? args[args.indexOf('--symbol') + 1] : '';
  if (!token.startsWith('0x') || token.length !== 42) {
    console.error('usage: wash-probe.ts --token 0x<40hex> [--hours 24] [--symbol SYM]');
    process.exit(1);
  }

  const meta = await geckoMeta(token);
  if (meta && !symbol) symbol = meta.symbol;
  const priceUsd = meta?.priceUsd ?? 0;

  const latest = Number(BigInt(await rpc('eth_blockNumber', [])));
  const span = Math.ceil((hours * 3600) / BLOCK_SEC);
  const fromBlock = latest - span;
  console.log(`\n🔎 wash-probe ${symbol || token}`);
  console.log(`   token ${token}`);
  console.log(`   window ~${hours}h  blocks ${fromBlock}..${latest} (${span})`);
  if (meta) console.log(`   gecko: price $${priceUsd.toExponential(3)} · 24h vol $${meta.vol24.toLocaleString()} · liq $${meta.liq.toLocaleString()}`);

  // --- pull all Transfer logs, chunked ---
  const xfers: Xfer[] = [];
  for (let b = fromBlock; b <= latest; b += CHUNK + 1) {
    const to = Math.min(b + CHUNK, latest);
    const logs = await rpc('eth_getLogs', [{
      address: token, topics: [TRANSFER_TOPIC],
      fromBlock: '0x' + b.toString(16), toBlock: '0x' + to.toString(16),
    }]);
    for (const l of logs) {
      if (!l.topics || l.topics.length < 3) continue;
      xfers.push({ from: addr(l.topics[1]), to: addr(l.topics[2]), value: toNum(l.data), block: Number(BigInt(l.blockNumber)) });
    }
    process.stdout.write(`\r   fetched ${xfers.length} transfers …`);
    await sleep(120);
  }
  console.log(`\n   total transfers: ${xfers.length}`);
  if (!xfers.length) { console.log('   no activity in window.'); return; }

  // --- identify the "market" side: high-degree addresses (pools/routers/PoolManager) ---
  const degree = new Map<string, number>();
  for (const x of xfers) {
    degree.set(x.from, (degree.get(x.from) ?? 0) + 1);
    degree.set(x.to, (degree.get(x.to) ?? 0) + 1);
  }
  // pool-side = appears in >4% of all transfers (and not the zero/mint addr)
  const threshold = Math.max(8, xfers.length * 0.04);
  const poolSide = new Set([...degree.entries()].filter(([a, d]) => d >= threshold && a !== ZERO).map(([a]) => a));
  console.log(`   liquidity/router addresses (auto): ${poolSide.size}`);

  // --- classify swaps: trader <-> pool ---
  interface T { buyVol: number; sellVol: number; buys: number; sells: number; blocks: number[]; }
  const traders = new Map<string, T>();
  const get = (a: string) => { let t = traders.get(a); if (!t) { t = { buyVol: 0, sellVol: 0, buys: 0, sells: 0, blocks: [] }; traders.set(a, t); } return t; };
  let mints = 0, swapXfers = 0;
  const eoaEdges = new Map<string, number>();   // for circular detection (non-pool transfers)

  for (const x of xfers) {
    if (x.from === ZERO) { mints++; continue; }
    const fromPool = poolSide.has(x.from), toPool = poolSide.has(x.to);
    if (fromPool && !toPool) { const t = get(x.to); t.buyVol += x.value; t.buys++; t.blocks.push(x.block); swapXfers++; }
    else if (!fromPool && toPool) { const t = get(x.from); t.sellVol += x.value; t.sells++; t.blocks.push(x.block); swapXfers++; }
    else if (!fromPool && !toPool) { eoaEdges.set(`${x.from}->${x.to}`, (eoaEdges.get(`${x.from}->${x.to}`) ?? 0) + 1); }
  }

  // --- circular EOA→EOA (A→B and B→A both exist) ---
  let circularPairs = 0;
  for (const key of eoaEdges.keys()) {
    const [a, b] = key.split('->');
    if (a < b && eoaEdges.has(`${b}->${a}`)) circularPairs++;
  }

  // --- metrics ---
  const list = [...traders.entries()].map(([a, t]) => ({ a, ...t, gross: t.buyVol + t.sellVol, net: Math.abs(t.buyVol - t.sellVol) }));
  list.sort((x, y) => y.gross - x.gross);
  let grossVol = list.reduce((s, t) => s + t.gross, 0);
  let tradersN = list.length;
  const top5 = list.slice(0, 5).reduce((s, t) => s + t.gross, 0);
  let top5Share = grossVol ? top5 / grossVol : 0;
  let hhi = grossVol ? list.reduce((s, t) => s + (t.gross / grossVol) ** 2, 0) * 10000 : 0;
  let infraExcluded = 0;

  const roundTrippers = list.filter(t => t.buys > 0 && t.sells > 0);
  // wash-like volume = the part each round-tripper both bought AND sold (min side ×2)
  const washVol = roundTrippers.reduce((s, t) => s + 2 * Math.min(t.buyVol, t.sellVol), 0);
  const washShare = grossVol ? washVol / grossVol : 0;
  const rtGross = roundTrippers.reduce((s, t) => s + t.gross, 0);
  const rtShare = grossVol ? rtGross / grossVol : 0;

  const onchainUsd = grossVol * priceUsd; // gross both-sides; DEX "volume" ~ one side, so /2 for comparability
  const onchainOneSide = onchainUsd / 2;

  // --- market-maker / bot detection (behavioral) ---
  // An MM/bot is two-sided (buys AND sells), high-frequency, near-flat net
  // exposure, and trades on a regular cadence. We score each active wallet.
  const BLOCK = BLOCK_SEC;
  interface Role { a: string; trades: number; gross: number; net: number; sided: number; churn: number; cadenceS: number; regularity: number; role: string; mmScore: number; }
  const roles: Role[] = list.filter(t => (t.buys + t.sells) >= 3).map(t => {
    const tr = traders.get(t.a)!;
    const trades = t.buys + t.sells;
    const sided = Math.min(t.buys, t.sells) / Math.max(t.buys, t.sells); // 1 = perfectly two-sided
    const churn = t.gross ? 1 - t.net / t.gross : 0;
    const blocks = [...tr.blocks].sort((a, b) => a - b);
    const gaps: number[] = [];
    for (let i = 1; i < blocks.length; i++) gaps.push((blocks[i] - blocks[i - 1]) * BLOCK);
    const mean = gaps.length ? gaps.reduce((s, g) => s + g, 0) / gaps.length : 0;
    const variance = gaps.length ? gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length : 0;
    const cv = mean ? Math.sqrt(variance) / mean : 0;       // low CV = metronomic = bot
    const regularity = gaps.length >= 4 ? Math.max(0, 1 - cv) : 0;
    // MM score: two-sided + high churn + frequent + (regular)
    let mmScore = 0;
    if (sided >= 0.4) mmScore += 1;
    if (churn >= 0.5) mmScore += 1;
    if (trades >= 20) mmScore += 1;
    if (regularity >= 0.4) mmScore += 1;
    if (Math.abs(t.net) / Math.max(t.gross, 1) < 0.25) mmScore += 1; // near-flat net exposure
    let role = 'retail';
    if (mmScore >= 3) role = 'MARKET-MAKER/BOT';
    else if (sided >= 0.4 && trades >= 8) role = 'active-trader';
    else if (t.sellVol === 0) role = 'accumulator';
    else if (t.buyVol === 0) role = 'distributor';
    return { a: t.a, trades, gross: t.gross, net: t.net, sided, churn, cadenceS: mean, regularity, role, mmScore };
  });
  let mms = roles.filter(r => r.role === 'MARKET-MAKER/BOT').sort((a, b) => b.gross - a.gross);

  // --- funder / deployer tracing (Blockscout, keyless) ---
  const doTrace = !args.includes('--no-trace');
  const traceMap = new Map<string, Origin>();
  let infraReclassified = 0;
  let sybilClusters: Array<{ origin: string; originName?: string; members: string[] }> = [];
  let cexFunded = 0, tracedN = 0;
  if (doTrace) {
    // targets: top 20 traders by gross + all MM wallets, deduped, capped
    const targets = [...new Set([...list.slice(0, 20).map(t => t.a), ...mms.map(m => m.a)])].slice(0, 36);
    process.stdout.write(`\n   tracing ${targets.length} wallets (funder/deployer) …`);
    for (const a of targets) {
      traceMap.set(a, await traceAddress(a));
      await sleep(180);
    }
    // reclassify infra (router/aggregator) contracts OUT of MM bucket
    for (const m of mms) {
      const o = traceMap.get(m.a);
      if (o?.infra) { m.role = 'INFRA-ROUTER'; infraReclassified++; }
    }
    mms = mms.filter(m => m.role === 'MARKET-MAKER/BOT');
    // cluster traced wallets by origin (shared funder/deployer = one operator)
    const byOrigin = new Map<string, string[]>();
    for (const [a, o] of traceMap) {
      if (!o.origin) continue;
      const l = byOrigin.get(o.origin) ?? []; l.push(a); byOrigin.set(o.origin, l);
    }
    sybilClusters = [...byOrigin.entries()].filter(([, m]) => m.length >= 2).map(([origin, members]) => ({ origin, members }));
    // recompute trader concentration EXCLUDING infra contracts (routers/settlement/
    // position managers) that the trace exposed — they're hops, not real traders.
    const infraSet = new Set([...traceMap.entries()].filter(([, o]) => o.infra).map(([a]) => a));
    if (infraSet.size) {
      const real = list.filter(t => !infraSet.has(t.a));
      const g = real.reduce((s, t) => s + t.gross, 0);
      if (g > 0) {
        grossVol = g; tradersN = real.length;
        top5Share = real.slice(0, 5).reduce((s, t) => s + t.gross, 0) / g;
        hhi = real.reduce((s, t) => s + (t.gross / g) ** 2, 0) * 10000;
        infraExcluded = infraSet.size;
      }
    }
    // label origins + count CEX-funded (organic signal)
    for (const c of sybilClusters) c.originName = await labelOf(c.origin);
    for (const o of traceMap.values()) { tracedN++; if (o.originName && CEX_NAME.test(o.originName)) cexFunded++; if (o.name && CEX_NAME.test(o.name)) cexFunded++; }
    // also label single-origin CEX funders among traced
    for (const o of traceMap.values()) { if (o.origin && !o.originName) { /* lazy: skip extra calls */ } }
  }
  const mmVol = mms.reduce((s, m) => s + m.gross, 0);
  const mmShare = grossVol ? mmVol / grossVol : 0;

  // --- verdict ---
  const flags: string[] = [];
  if (top5Share > 0.7) flags.push(`top-5 wallets = ${(top5Share * 100).toFixed(0)}% of volume`);
  if (hhi > 2500) flags.push(`HHI ${hhi.toFixed(0)} (concentrated)`);
  if (washShare > 0.5) flags.push(`${(washShare * 100).toFixed(0)}% of volume is same-wallet round-trips`);
  if (tradersN < 25) flags.push(`only ${tradersN} distinct traders`);
  if (circularPairs > 0) flags.push(`${circularPairs} circular EOA↔EOA pairs`);

  // sybil signal: a non-CEX origin funding/deploying several "distinct" traders
  const biggestSybil = sybilClusters
    .filter(c => !(c.originName && CEX_NAME.test(c.originName)))
    .reduce((mx, c) => Math.max(mx, c.members.length), 0);
  if (biggestSybil >= 4) flags.push(`${biggestSybil} "distinct" traders share one funder/deployer (sybil)`);

  let verdict = 'ORGANIC';
  const washScore = (top5Share > 0.7 ? 1 : 0) + (washShare > 0.5 ? 1 : 0) + (hhi > 2500 ? 1 : 0)
    + (tradersN < 25 ? 1 : 0) + (biggestSybil >= 4 ? 1 : 0);
  if (washScore >= 3) verdict = 'WASH-SUSPECT';
  else if (washScore >= 1) verdict = 'MIXED';

  // --- report ---
  console.log(`\n📊 RESULTS  (${symbol})`);
  console.log(`   swap transfers:        ${swapXfers}  (mints/LP: ${mints})`);
  console.log(`   distinct traders:      ${tradersN}`);
  console.log(`   buys / sells:          ${list.reduce((s, t) => s + t.buys, 0)} / ${list.reduce((s, t) => s + t.sells, 0)}`);
  console.log(`   gross token volume:    ${grossVol.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${symbol}`);
  if (priceUsd) {
    console.log(`   on-chain swap vol:     ~$${onchainOneSide.toLocaleString(undefined, { maximumFractionDigits: 0 })} (one-side, ${hours}h)`);
    if (meta) console.log(`   reported 24h vol:      $${meta.vol24.toLocaleString(undefined, { maximumFractionDigits: 0 })}  → ratio on-chain/reported = ${(onchainOneSide / (meta.vol24 * hours / 24) ).toFixed(2)}`);
  }
  console.log(`\n   CONCENTRATION${infraExcluded ? ` (excl. ${infraExcluded} infra contracts)` : ''}`);
  console.log(`     real traders:        ${tradersN}`);
  console.log(`     top-5 share:         ${(top5Share * 100).toFixed(1)}%`);
  console.log(`     HHI:                 ${hhi.toFixed(0)}  (1500=competitive, >2500=concentrated)`);
  console.log(`\n   ROUND-TRIP / WASH SIGNAL`);
  console.log(`     round-trip wallets:  ${roundTrippers.length} / ${tradersN}  (${(rtShare * 100).toFixed(0)}% of volume)`);
  console.log(`     same-wallet churn:   ${(washShare * 100).toFixed(1)}% of gross volume is bought-and-sold by the same wallet`);
  console.log(`     circular EOA pairs:  ${circularPairs}`);
  console.log(`\n   TOP 8 TRADERS  (gross | net | b/s)`);
  for (const t of list.slice(0, 8)) {
    const churn = t.gross ? (1 - t.net / t.gross) : 0;
    console.log(`     ${t.a}  ${(t.gross * priceUsd).toFixed(0).padStart(7)}$  net ${(t.net * priceUsd).toFixed(0).padStart(7)}$  ${t.buys}b/${t.sells}s  churn ${(churn * 100).toFixed(0)}%`);
  }
  console.log(`\n   MARKET-MAKER / BOT DETECTION`);
  console.log(`     MM/bot wallets:      ${mms.length}  (${(mmShare * 100).toFixed(1)}% of volume)`);
  if (mms.length) {
    console.log(`     these wallets are two-sided, high-frequency, near-flat net, regular cadence:`);
    for (const m of mms.slice(0, 6)) {
      console.log(`       ${m.a}  ${(m.gross * priceUsd).toFixed(0).padStart(7)}$  ${m.trades}tx  sided ${(m.sided * 100).toFixed(0)}%  churn ${(m.churn * 100).toFixed(0)}%  ~${m.cadenceS ? Math.round(m.cadenceS) + 's/tx' : 'n/a'}  reg ${(m.regularity * 100).toFixed(0)}%  [mm ${m.mmScore}/5]`);
    }
    const mmAssess = mmShare > 0.5 ? 'DOMINANT — volume is largely MM-driven' :
                     mmShare > 0.2 ? 'PRESENT — meaningful MM/bot layer atop real flow' :
                                     'LIGHT — minor MM/bot presence, mostly organic';
    console.log(`     → assessment: ${mmAssess}`);
  } else {
    console.log(`     → no behavioral market-maker signature (no two-sided high-frequency flat-net wallets).`);
  }

  if (doTrace) {
    console.log(`\n   FUNDER / DEPLOYER TRACE  (${tracedN} wallets via Blockscout)`);
    if (infraReclassified) console.log(`     reclassified ${infraReclassified} "MM" wallet(s) as INFRA routers/aggregators (named contracts — not a single MM).`);
    console.log(`     CEX-funded wallets:  ${cexFunded}  ${cexFunded ? '(withdrawals from exchanges = organic retail signal)' : ''}`);
    if (sybilClusters.length) {
      console.log(`     ⚠ shared-origin clusters (same funder/deployer behind multiple wallets):`);
      for (const c of sybilClusters.sort((a, b) => b.members.length - a.members.length).slice(0, 8)) {
        console.log(`       ${c.origin}${c.originName ? ' ['+c.originName+']' : ''} → ${c.members.length} wallets: ${c.members.map(m => m.slice(0, 8)).join(', ')}`);
      }
    } else {
      console.log(`     no shared-funder clusters among traced wallets — independent participants.`);
    }
    // labeled contracts among traced
    const named = [...traceMap.entries()].filter(([, o]) => o.name);
    if (named.length) {
      console.log(`     labeled contracts seen:`);
      for (const [a, o] of named.slice(0, 8)) console.log(`       ${a.slice(0, 12)}…  "${o.name}"${o.infra ? ' (infra)' : ''}`);
    }
  }

  console.log(`\n🏷  VERDICT: ${verdict}  (washScore ${washScore}/5)`);
  if (flags.length) { console.log(`   flags:`); for (const f of flags) console.log(`     • ${f}`); }
  else console.log(`   no wash flags raised — broad participation, low churn.`);
  console.log();
}

main().catch(e => { console.error(e); process.exit(1); });
