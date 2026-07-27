import "dotenv/config";
import { runPipeline } from "./engine/pipeline.js";
import { recordSignals, resolveOpen, report } from "./engine/paper-engine.js";

// Local tooling — no payment, no server.
//   npm run scan          inspect the live edge universe
//   npm run scan paper    record current edges as paper bets + settle resolved
//   npm run scan report   print the CLV report (the go-live gate)
const cmd = process.argv[2] ?? "scan";

async function scan() {
  const r = await runPipeline();
  console.log(`\nScanned ${r.scannedMarkets} markets · ${r.fixtures} fixtures · ${r.matched} matched`);
  if (!r.oddsConfigured) console.log("⚠  ODDS_API_KEY not set — fail-closed, no edges. Set it in .env to price markets.");
  if (r.signals.length === 0) { console.log("No edges clear the cost buffer right now.\n"); return r; }

  console.log(`\nTop ${Math.min(15, r.signals.length)} edges (netEdge desc):\n`);
  for (const s of r.signals.slice(0, 15)) {
    console.log(`  +${(s.netEdge * 100).toFixed(1)}%  ${s.outcomeLabel}  @${s.entryPrice.toFixed(3)}  (fair ${s.pFair.toFixed(3)})  Kelly $${s.kellyStakeUsd}`);
    console.log(`        ${s.question}`);
    console.log(`        ${s.url}\n`);
  }
  return r;
}

function printReport() {
  const rep = report();
  console.log("\n── CLV report ──────────────────────────────────────────");
  console.log(`  positions:  ${rep.total} total · ${rep.open} open · ${rep.settled} settled`);
  console.log(`  record:     ${rep.wins}W / ${rep.losses}L  (${rep.winRatePct.toFixed(1)}% win rate)`);
  console.log(`  avg CLV:    ${rep.avgClvPct >= 0 ? "+" : ""}${rep.avgClvPct}%   ← the metric that matters`);
  console.log(`  PnL:        $${rep.totalPnlUsd} on $${rep.totalStaked} staked (${rep.roiPct >= 0 ? "+" : ""}${rep.roiPct}% ROI)`);
  console.log(`\n  ${rep.verdict}\n`);
}

async function main() {
  if (cmd === "report") { printReport(); return; }

  const r = await scan();
  if (cmd === "paper") {
    const added = recordSignals(r.signals);
    const settled = await resolveOpen();
    console.log(`Paper: +${added} new positions, ${settled} settled this pass.`);
    printReport();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
