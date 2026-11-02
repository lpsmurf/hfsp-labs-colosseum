// position-manager — the CAPITAL + EXECUTION layer for Solana CLMM positions.
// Differentiator vs other position managers: fund a position from ANY chain or fiat,
// rebalance/exit cross-chain, and cash out to a bank — reusing this skill's proven,
// safety-gated bridge + Onramper. Plus a self-contained CLMM advisory engine.
//
// usage:
//   tsx scripts/position.ts analyze <entry> <current> <lower> <upper> <valueUsd> <feeAprPct> <days>
//   tsx scripts/position.ts fund-fiat <fiat> <amount>        # fiat -> USDC on Solana (Onramper)
//   tsx scripts/position.ts exit-fiat <amountUSDC> <fiat>    # USDC on Solana -> fiat (Onramper)
//   tsx scripts/position.ts fund-bridge <amountUSDC> <fromChain>   # bridge in: see bridge-return
//   tsx scripts/position.ts exit-bridge <amountUSDC> <toChain>     # bridge out: see bridge-execute
import "./env.js";
import { analyzePosition } from "./clmm-engine.js";
import { onrampQuote, offrampQuote } from "./onramp.js";

async function main() {
  const [cmd, ...a] = process.argv.slice(2);
  switch (cmd) {
    case "analyze": {
      const [entry, current, lower, upper, valueUsd, feeApr, days] = a.map(Number);
      const r = analyzePosition({
        entryPrice: entry, currentPrice: current, lowerPrice: lower, upperPrice: upper,
        positionValueUsd: valueUsd, feeAprPct: feeApr, horizonDays: days,
      });
      console.log("=== CLMM POSITION ANALYSIS ===");
      console.log(JSON.stringify(r, null, 2));
      console.log(`\nVERDICT: ${r.rebalanceVerdict.toUpperCase()} — ${r.reason}`);
      break;
    }
    case "fund-fiat": {
      // Fund a Solana position with fiat (card/bank) — delivered as USDC on Solana.
      const r = await onrampQuote(a[0], Number(a[1]), "solana");
      if (!r.best) { console.log("no onramp quote"); break; }
      console.log("=== FUND POSITION FROM FIAT (Onramper) ===");
      console.log("[note] Onramper runs on SANDBOX for now (production fiat coming soon); the cross-chain bridge is LIVE.");
      console.log(`Best: ${r.best.provider}  pay ${a[1]} ${a[0].toUpperCase()} -> receive ${r.best.payout} USDC on Solana  (fee ${r.best.feePct.toFixed(2)}%)`);
      console.log("→ then open/top-up the CLMM position with the delivered USDC.");
      break;
    }
    case "exit-fiat": {
      // Cash out position proceeds to fiat.
      const r = await offrampQuote(Number(a[0]), a[1], "solana");
      if (!r.best) { console.log("no offramp quote (sell may be unavailable in this environment)"); break; }
      console.log("=== EXIT POSITION TO FIAT (Onramper) ===");
      console.log("[note] Onramper runs on SANDBOX for now (production fiat coming soon); the cross-chain bridge is LIVE.");
      console.log(`Best: ${r.best.provider}  sell ${a[0]} USDC -> receive ${r.best.payout} ${a[1].toUpperCase()}  (fee ${r.best.feePct.toFixed(2)}%)`);
      break;
    }
    case "fund-bridge":
      console.log(`Fund a Solana position from ${a[1]}: bridge ${a[0]} USDC in via the proven return path:`);
      console.log(`   npm run return ${a[0]}        # ${a[1]} -> Solana (preview; add --confirm to execute)`);
      break;
    case "exit-bridge":
      console.log(`Move ${a[0]} USDC from Solana to ${a[1]} via the aggregator's best route:`);
      console.log(`   npm run execute USDC ${a[0]} ${a[1]} USDC      # preview; add --confirm to execute`);
      break;
    default:
      console.log("usage: analyze | fund-fiat <fiat> <amount> | exit-fiat <amountUSDC> <fiat> | fund-bridge <amountUSDC> <fromChain> | exit-bridge <amountUSDC> <toChain>");
  }
}
main().catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
