// Keep the Base USDC float topped up for paying Cryptorefills.
//
//   npx tsx scripts/celo-rebalance.ts [--target 20] [--reserve 2] [--send]
//
// Payments arrive as Celo stablecoins in the operator wallet; Cryptorefills is
// paid in USDC on Base. When the Base float falls below --target, this bridges
// enough Celo USD₮ (keeping --reserve behind for in-flight orders) to refill it.
// Dry run by default: prints the plan and bridges nothing without --send.
// Meant to run from the store host, on a cron, once funds and a float exist.
import "dotenv/config";
import { ethers } from "ethers";
import { quoteExactOutput, executeBridge } from "../src/services/relay.js";
import { TOKENS, wallets, baseUsdcBalance } from "../src/services/evm.js";

const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? Number(process.argv[i + 1]) : fallback;
};
const send = process.argv.includes("--send");
const targetUsdc = arg("target", Number(process.env.FLOAT_TARGET_USDC ?? "20"));
const reserveUsdt = arg("reserve", Number(process.env.FLOAT_RESERVE_USDT ?? "2"));
const atomic = (usd: number) => BigInt(Math.round(usd * 1e6));

const { celo } = wallets();
const usdt = new ethers.Contract(TOKENS.celo.USDT, ["function balanceOf(address) view returns (uint256)"], celo);

const baseUsdc = await baseUsdcBalance();
const celoUsdt: bigint = await usdt.balanceOf(celo.address);
console.log(`base float   ${(Number(baseUsdc) / 1e6).toFixed(6)} USDC   (target ${targetUsdc})`);
console.log(`celo USD₮    ${(Number(celoUsdt) / 1e6).toFixed(6)}   (reserve ${reserveUsdt})`);

if (baseUsdc >= atomic(targetUsdc)) { console.log("Float at or above target — nothing to do."); process.exit(0); }

const deficit = atomic(targetUsdc) - baseUsdc;
const spendable = celoUsdt > atomic(reserveUsdt) ? celoUsdt - atomic(reserveUsdt) : 0n;
if (spendable === 0n) { console.log("No spendable Celo USD₮ above the reserve — top up the operator wallet."); process.exit(0); }

// Quote the exact-output bridge, but never consume more USD₮ than is spendable.
const quote = await quoteExactOutput("USDT", deficit);
console.log(`refill ${(Number(deficit) / 1e6).toFixed(6)} USDC on Base  ⇐  ${(Number(quote.amountIn) / 1e6).toFixed(6)} Celo USD₮`);
if (quote.amountIn > spendable) {
  console.log(`Need ${(Number(quote.amountIn) / 1e6).toFixed(6)} USD₮ but only ${(Number(spendable) / 1e6).toFixed(6)} is spendable. Bridge manually or top up.`);
  process.exit(1);
}
if (!send) { console.log("\nDry run. Re-run with --send to bridge."); process.exit(0); }

const bridge = await executeBridge(quote);
console.log(`bridged  ${bridge.requestId}  ${bridge.txHashes.join(" ")}`);
console.log(`new base float ${(Number(await baseUsdcBalance()) / 1e6).toFixed(6)} USDC`);
process.exit(0);
