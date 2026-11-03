/**
 * Buyer-agent demo: discover → lint → rank → (pay → consume).
 *
 * Runs fully offline through the "rank + parse real 402" stage with zero external
 * services. The final on-chain settle runs only if you provide a funded devnet
 * wallet (SOLANA_SECRET_KEY as a JSON array) + HELIUS_RPC_URL — otherwise the demo
 * prints the exact payment the buyer WOULD make. Honest by design.
 */
import { createSeller } from "./seller.mjs";
import { lint, verdict } from "../../checker/x402-commerce-lint.mjs";

const log = (...a) => console.log(...a);

async function main() {
  const server = await new Promise((resolve) => {
    const s = createSeller().listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  log(`\nx402-commerce buyer-agent demo\nseller up at ${base}\n`);

  // 1. DISCOVER
  const manifest = await (await fetch(`${base}/.well-known/x402`)).json();
  log(`1. discovered ${manifest.resources.length} routes from /.well-known/x402`);

  // 2. LINT — drop any seller whose listing isn't safe to buy from
  const findings = lint(manifest);
  const v = verdict(findings);
  log(`2. commerce-lint: ${v.go ? "GO ✓" : "NO-GO ✗"} (${v.blocking} blocking, ${v.total} findings)`);
  if (!v.go) { log("   refusing to buy from a NO-GO seller"); server.close(); process.exit(1); }

  // 3. RANK by net cost (here: amount; real buyers add retry-risk + schema fit)
  const ranked = manifest.resources
    .map((r) => ({ url: r.url, amount: Number(r.accepts[0].amount), memo: r.accepts[0].extra?.memo }))
    .sort((a, b) => a.amount - b.amount);
  log(`3. ranked by net cost: ${ranked.map((r) => `${r.url.split("/").pop()}=${r.amount}µ`).join(", ")}`);
  const winner = ranked[0];

  // 4. Trigger the REAL 402 challenge from the SDK (no payment yet)
  const res402 = await fetch(winner.url, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  const challenge = await res402.json();
  const accept = challenge.accepts?.[0];
  log(`4. real 402 from ${winner.url.split("/").pop()}: pay ${accept.amount}µUSDC to ${accept.payTo}` +
      (accept.extra?.memo ? ` with memo "${accept.extra.memo}" (resource binding)` : ""));

  // 5. SETTLE — only with a funded wallet; otherwise show the intended payment.
  const sk = process.env.SOLANA_SECRET_KEY;
  if (sk && process.env.HELIUS_RPC_URL) {
    const { X402Client } = await import("@hfsp/x402-sdk/client");
    const { Keypair } = await import("@solana/web3.js");
    const wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(sk)));
    const client = new X402Client({ wallet, rpcUrl: process.env.HELIUS_RPC_URL });
    const paid = await client.fetch(winner.url, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    log(`5. paid + consumed: ${await paid.text()}`);
  } else {
    log(`5. (offline) set SOLANA_SECRET_KEY + HELIUS_RPC_URL to run the real pay→200 settle.`);
    log(`   the buyer would transfer ${accept.amount}µUSDC + attach memo "${accept.extra?.memo}", then retry with X-Solana-Tx.`);
  }

  log(`\n✓ discover → lint → rank → challenge proven end to end.`);
  server.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
