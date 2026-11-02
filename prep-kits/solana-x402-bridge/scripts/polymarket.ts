// usage:
//   tsx scripts/polymarket.ts read [keyword]
//   tsx scripts/polymarket.ts bet <marketId> <YES|NO> <amountUSDC>
// Polymarket runs on Polygon (USDC.e). Reuse existing partial implementation.
async function read(keyword?: string) {
  // TODO(devin): GET ${POLYMARKET_API_URL} CLOB markets; filter by keyword; return odds/liquidity/status.
  throw new Error("TODO: implement Polymarket read via CLOB API");
}
async function bet(marketId: string, outcome: string, amount: number) {
  // TODO(devin): ensure USDC.e on Polygon (else trigger bridge), then place CLOB order; return position.
  throw new Error("TODO: implement Polymarket bet (reuse partial code)");
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "read") read(rest[0]);
else if (cmd === "bet") bet(rest[0], rest[1], Number(rest[2]));
else console.log("usage: read [keyword] | bet <marketId> <YES|NO> <amountUSDC>");
