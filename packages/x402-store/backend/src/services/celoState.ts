// Durable state for the Celo rail: price locks, reconciliation records, and the
// facilitator-credit guard.
import { createHash } from "crypto";
import { celoEnv } from "../celoConfig.js";
import { redis } from "./redis.js";
import { alert } from "./alert.js";
import type { CeloAsset } from "./evm.js";

export interface PriceLock {
  asset: CeloAsset;
  priceAtomic: string;   // what the buyer pays us, in the Celo asset
  crAtomic: string;      // Cryptorefills' Base USDC price when quoted
  bridgeAtomic: string;  // bridge input quoted (0 in float mode)
  float: boolean;
  quotedAt: number;
}

/** The same order body and asset always map to the same lock. */
export function orderKey(body: unknown, asset: CeloAsset): string {
  return createHash("sha256").update(JSON.stringify(body)).update(asset).digest("hex");
}

/**
 * A price must not move between the 402 and the paid retry: the buyer signs an
 * exact amount, and a re-quote that differs by one atomic unit would make the
 * facilitator reject a payment the buyer already approved.
 */
export async function getLock(key: string): Promise<PriceLock | null> {
  const raw = await redis.get(`store:celo:lock:${key}`);
  return raw ? JSON.parse(raw) : null;
}

export async function setLock(key: string, lock: PriceLock): Promise<void> {
  await redis.set(`store:celo:lock:${key}`, JSON.stringify(lock), "EX", celoEnv.PRICE_LOCK_SECONDS);
}

export async function dropLock(key: string): Promise<void> {
  await redis.del(`store:celo:lock:${key}`);
}

/** Anything paid but not fulfilled lands here for a human to settle. */
export async function recordReconciliation(entry: Record<string, unknown>): Promise<void> {
  await redis.lpush("store:celo:recon", JSON.stringify({ at: new Date().toISOString(), ...entry }));
  console.error("[store:celo] RECONCILE", entry);
  // Money is held with nothing delivered — surface it immediately, don't wait
  // for the periodic monitor. Best-effort; alert() never throws.
  await alert("Order needs reconciliation (paid, not delivered)", entry);
}

let credits: { value: number; at: number } | undefined;

/** Mainnet settlement credits left on the facilitator account (cached 60 s). */
export async function facilitatorCredits(): Promise<number> {
  if (credits && Date.now() - credits.at < 60_000) return credits.value;
  const res = await fetch(`https://api.x402.celo.org/api/account?address=${celoEnv.FACILITATOR_ACCOUNT_ADDRESS}`, { signal: AbortSignal.timeout(10_000) });
  const body = await res.json() as { exists?: boolean; balances?: { mainnet?: number } };
  const value = body.exists ? Number(body.balances?.mainnet ?? 0) : 0;
  credits = { value, at: Date.now() };
  return value;
}
