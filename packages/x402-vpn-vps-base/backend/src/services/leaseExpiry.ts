import { Redis } from "ioredis";
import { deleteServer } from "./hetzner.js";
import env from "../config.js";

export const redis = new Redis(env.REDIS_URL);

export async function registerServerLease(serverId: number, expiresAt: Date) {
  const ttlSeconds = Math.ceil((expiresAt.getTime() - Date.now()) / 1000);
  await redis.set(
    `server:lease:${serverId}`,
    JSON.stringify({ expiresAt: expiresAt.toISOString() }),
    "EX",
    ttlSeconds + 300 // keep key 5min past expiry so cron can catch it
  );
}

async function scanExpired() {
  const keys = await redis.keys("server:lease:*");
  for (const key of keys) {
    const raw = await redis.get(key);
    if (!raw) continue;
    const { expiresAt } = JSON.parse(raw) as { expiresAt: string };
    if (new Date(expiresAt) <= new Date()) {
      const serverId = parseInt(key.split(":")[2], 10);
      try {
        await deleteServer(serverId);
        await redis.del(key);
        console.log(`[leaseExpiry] destroyed server ${serverId}`);
      } catch (err) {
        console.error(`[leaseExpiry] failed to destroy server ${serverId}:`, err);
      }
    }
  }
}

export function startLeaseExpiryCron() {
  const INTERVAL_MS = 5 * 60 * 1000;
  setInterval(() => scanExpired().catch(console.error), INTERVAL_MS);
  scanExpired().catch(console.error);
  console.log("[leaseExpiry] cron started (5min interval)");
}
