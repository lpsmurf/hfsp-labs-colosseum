// usage:
//   tsx scripts/polymarket.ts read [keyword]            # live markets + odds (read-only)
//   tsx scripts/polymarket.ts bet <marketId> <YES|NO> <amountUSDC>   # roadmap
// Polymarket runs on Polygon (USDC.e). `read` is live via the public Gamma API; `bet`
// (CLOB order placement) is on the roadmap — bridge USDC to Polygon first via this skill.
import "./env.js";

const GAMMA = process.env.POLYMARKET_GAMMA_URL ?? "https://gamma-api.polymarket.com";

async function read(keyword?: string) {
  const url = `${GAMMA}/markets?active=true&closed=false&order=volumeNum&ascending=false&limit=120`;
  const res = await fetch(url);
  const all: any[] = await res.json();
  const norm = (s: string) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const kw = norm(keyword ?? "");
  const matched = (kw ? all.filter((m) => norm(m.question).includes(kw)) : all).slice(0, 8);
  if (!matched.length) { console.log(`No active markets${keyword ? ` matching "${keyword}"` : ""}.`); return; }

  console.log(`Polymarket — top ${matched.length} active markets${keyword ? ` matching "${keyword}"` : ""} (by volume):`);
  for (const m of matched) {
    let outs: string[] = [], prices: string[] = [];
    try { outs = JSON.parse(m.outcomes ?? "[]"); prices = JSON.parse(m.outcomePrices ?? "[]"); } catch { /* skip parse */ }
    const odds = outs.map((o, i) => `${o} ${(Number(prices[i]) * 100).toFixed(1)}%`).join("  |  ");
    console.log(`\n• ${m.question}`);
    if (odds) console.log(`  ${odds}`);
    console.log(`  vol $${Math.round(Number(m.volumeNum || 0)).toLocaleString()}  liq $${Math.round(Number(m.liquidityNum || 0)).toLocaleString()}  ends ${(m.endDate ?? "").slice(0, 10)}`);
    console.log(`  conditionId ${m.conditionId}`);
  }
}

async function bet(_marketId: string, _outcome: string, _amount: number) {
  throw new Error(
    "polymarket-bet is on the ROADMAP — placing a CLOB order (USDC.e on Polygon) needs order signing. " +
    "Use this skill to bridge USDC onto Polygon first (npm run execute USDC <amt> polygon USDC), then place the bet. " +
    "Reading markets is live: `npm run polymarket read <keyword>`.",
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "read") read(rest[0]).catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
  else if (cmd === "bet") bet(rest[0], rest[1], Number(rest[2])).catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
  else console.log("usage: read [keyword] | bet <marketId> <YES|NO> <amountUSDC>");
}
