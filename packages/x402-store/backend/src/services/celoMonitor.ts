// Unattended health monitor for the Celo rail.
//
// Every CHECK_INTERVAL it looks at the things that silently stop the store from
// fulfilling orders — settlement credits, gas, float, and orders stuck in
// reconciliation — and alerts only when a value crosses a threshold, so a
// healthy store is quiet and a recovering one says so once. State is kept in
// redis so a restart does not re-alert on an already-known condition.
import { ethers } from "ethers";
import { celoEnv } from "../celoConfig.js";
import { wallets, baseUsdcBalance } from "./evm.js";
import { facilitatorCredits } from "./celoState.js";
import { redis } from "./redis.js";
import { alert } from "./alert.js";

const CHECK_INTERVAL_MS = Number(process.env.CELO_MONITOR_INTERVAL_MS ?? String(5 * 60_000));
// Enough Celo gas to send the swap/bridge transactions for a handful of orders.
const MIN_CELO_GAS = 0.05;
// A float that has drained below this can no longer cover typical orders.
const LOW_FLOAT_USDC = 1;
const MANY_PENDING = 3;
const STATE_KEY = "store:celo:monitor:state";

type Health = "ok" | "warn";

async function lastState(): Promise<Record<string, Health>> {
  try { return JSON.parse((await redis.get(STATE_KEY)) ?? "{}"); } catch { return {}; }
}

/** Alert only when `key` changes state, so a standing condition is not repeated. */
async function transition(state: Record<string, Health>, key: string, health: Health, onWarn: () => void, onClear?: () => void): Promise<void> {
  const prev = state[key] ?? "ok";
  if (health === prev) return;
  state[key] = health;
  if (health === "warn") onWarn(); else onClear?.();
}

async function runCheck(): Promise<void> {
  const state = await lastState();
  try {
    const credits = await facilitatorCredits();
    await transition(state, "credits", credits < celoEnv.MIN_FACILITATOR_CREDITS ? "warn" : "ok",
      () => void alert("Facilitator credits low — Celo settlement will pause", { credits, min: celoEnv.MIN_FACILITATOR_CREDITS }),
      () => void alert("Facilitator credits recovered", { credits }));

    const celoGas = Number(ethers.formatEther(await wallets().celo.provider!.getBalance(wallets().celo.address)));
    await transition(state, "gas", celoGas < MIN_CELO_GAS ? "warn" : "ok",
      () => void alert("Operator CELO gas low — swaps and bridges may fail", { celoGas, min: MIN_CELO_GAS }),
      () => void alert("Operator CELO gas recovered", { celoGas }));

    if (celoEnv.STORE_FLOAT_MODE) {
      const float = Number(await baseUsdcBalance()) / 1e6;
      await transition(state, "float", float < LOW_FLOAT_USDC ? "warn" : "ok",
        () => void alert("Base USDC float low — orders will fall back to bridging or fail", { float, min: LOW_FLOAT_USDC }),
        () => void alert("Base USDC float recovered", { float }));
    }

    const pending = await redis.llen("store:celo:recon");
    await transition(state, "recon", pending >= MANY_PENDING ? "warn" : "ok",
      () => void alert("Orders awaiting reconciliation", { pending }),
      () => void alert("Reconciliation queue cleared"));

    await redis.set(STATE_KEY, JSON.stringify(state), "EX", 7 * 24 * 3600);
  } catch (err) {
    console.error("[store:celo] monitor check failed:", err instanceof Error ? err.message : err);
  }
}

let timer: ReturnType<typeof setInterval> | undefined;

/** Start the periodic monitor. Idempotent; the timer does not keep the process alive. */
export function startCeloMonitor(): void {
  if (timer) return;
  void runCheck();
  timer = setInterval(() => void runCheck(), CHECK_INTERVAL_MS);
  timer.unref?.();
  console.error(`[store:celo] health monitor every ${Math.round(CHECK_INTERVAL_MS / 1000)}s`);
}
