// usage: tsx scripts/bridge-quote.ts <srcToken> <amountIn> <destChain> <destToken>
//   bridge: tsx scripts/bridge-quote.ts USDC 5 polygon USDC
//   swap:   tsx scripts/bridge-quote.ts SOL 1 ethereum ETH
import { aggregate } from "./bridge-aggregator.js";
import type { EvmChain } from "./types.js";

const [srcToken, amountIn, destChain, destToken] = process.argv.slice(2);
aggregate(srcToken, Number(amountIn), destChain as EvmChain, destToken).then(({ best, ranked }) => {
  if (!best) { console.log("No eligible route for this pair."); return; }
  console.log(`BEST (${best.kind}):`, JSON.stringify(best, null, 2));
  console.log("\nCOMPARISON (ranked, net of fees + impact):");
  for (const q of ranked)
    console.log(`  ${q.provider.padEnd(10)} out=${q.amountOut} ${q.destToken} impact=${q.priceImpactBps}bps eta=${q.etaSeconds}s`);
});
