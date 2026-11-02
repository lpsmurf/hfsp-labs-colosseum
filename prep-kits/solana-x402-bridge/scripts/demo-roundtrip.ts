// Read-only recap of a REAL cross-chain round trip (Allbridge, native USDC).
// Shows both on-chain tx hashes + live balances. Moves no funds. Used for the demo video.
import "./env.js";

const LEG1 = "5PRGrU7qC1s6LmvLYmQ8iU1ZGyU4qkvynxGVoK1FCy3kW36SpBh8M8yaiTqH97ZUmbs2o4kr33DFeCSYEH62J3Qk";
const LEG2 = "0x5cb09254977140845386432ae6b89416f3883c35a9b3254a36a2a9979642ae77";
const SOL = "7yESaEnYPnvSpRFK8xFb9TzdbXh1ppU9sgfmckwKAqLo";
const EVM = "0x3CcCd869AF2d489e2EEb97Ea5299D0F864e7c0A8";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const POL_USDC = "0x3c499c542cEF5E3811e1192ce70d8cc03d5c3359";

async function rpc(url: string, body: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.json() as any;
}
async function solUsdc(): Promise<string> {
  const d = await rpc(process.env.SOLANA_RPC_URL!, { jsonrpc: "2.0", id: 1, method: "getTokenAccountsByOwner", params: [SOL, { mint: USDC_MINT }, { encoding: "jsonParsed" }] });
  const a = d.result?.value ?? [];
  return a.length ? String(a[0].account.data.parsed.info.tokenAmount.uiAmount) : "0";
}
async function polUsdc(): Promise<string> {
  const data = "0x70a08231000000000000000000000000" + EVM.slice(2);
  const d = await rpc(process.env.POLYGON_RPC_URL!, { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: POL_USDC, data }, "latest"] });
  return d.result && d.result !== "0x" ? String(parseInt(d.result, 16) / 1e6) : "0";
}

(async () => {
  console.log("┌──────────────────────────────────────────────────────────────────┐");
  console.log("│  solana-x402-bridge — REAL cross-chain round trip (Allbridge)      │");
  console.log("│  best-rate aggregation · safety preflight · slippage-protected     │");
  console.log("└──────────────────────────────────────────────────────────────────┘");
  console.log("");
  console.log("LEG 1   Solana ──▶ Polygon      0.5 USDC  (native)");
  console.log("        tx  " + LEG1);
  console.log("        →   https://explorer.solana.com/tx/" + LEG1);
  console.log("");
  console.log("LEG 2   Polygon ──▶ Solana      0.5 USDC  (return)");
  console.log("        tx  " + LEG2);
  console.log("        →   https://polygonscan.com/tx/" + LEG2);
  console.log("");
  console.log("Live on-chain balances:");
  const [s, p] = await Promise.all([solUsdc(), polUsdc()]);
  console.log("        Solana  USDC " + s + "   (" + SOL + ")");
  console.log("        Polygon USDC " + p + "   (" + EVM + ")");
  console.log("");
  console.log("Initiated from a Solana wallet. One skill. Cross-chain. Non-custodial.");
})();
