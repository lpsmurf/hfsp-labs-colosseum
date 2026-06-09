import { Redis } from "ioredis";
import env from "../config.js";

export const redis = new Redis(env.REDIS_URL, { lazyConnect: true });

// Returns true on first claim, false if already used (replay protection).
export async function claimTxSig(txSig: string): Promise<boolean> {
  const result = await redis.set(`store:tx:${txSig}`, "1", "EX", 90_000, "NX");
  return result === "OK";
}

export async function releaseTxSig(txSig: string): Promise<void> {
  await redis.del(`store:tx:${txSig}`);
}
