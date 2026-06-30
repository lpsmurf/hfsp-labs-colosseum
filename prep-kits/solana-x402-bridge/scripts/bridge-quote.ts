// usage: tsx scripts/bridge-quote.ts <amountUSDC> <destChain> <destToken=usdc>
// Aggregates all bridge providers and returns the BEST route + the full comparison.
import { aggregate } from "./bridge-aggregator.js";
import type { EvmChain } from "./types.js";

const [amount, chain, token] = process.argv.slice(2);
aggregate(Number(amount), chain as EvmChain, token).then(({ best, ranked }) => {
  if (!best) { console.log("No eligible route."); return; }
  console.log("BEST:", JSON.stringify(best, null, 2));
  console.log("\nCOMPARISON (ranked, net of fees):");
  for (const q of ranked) console.log(`  ${q.provider.padEnd(10)} out=${q.amountOutUSDC} fee=${q.bridgeFeeUSDC} eta=${q.etaSeconds}s`);
});
