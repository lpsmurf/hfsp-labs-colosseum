import type { ReplayStore } from "../types.js";

/**
 * In-memory replay store. Sufficient for single-instance deployments.
 * TTL defaults to 25 hours — covers any Solana finality window.
 * For multi-instance or persistent protection, use a RedisReplayStore.
 */
export class MemoryReplayStore implements ReplayStore {
  private readonly store = new Map<string, number>();
  private readonly ttlMs: number;

  constructor(ttlHours = 25) {
    this.ttlMs = ttlHours * 60 * 60 * 1000;
    // Prune expired entries every 10 minutes
    setInterval(() => this.prune(), 10 * 60 * 1000).unref();
  }

  async claim(txSig: string): Promise<boolean> {
    const now = Date.now();
    if (this.store.has(txSig)) return false;
    this.store.set(txSig, now + this.ttlMs);
    return true;
  }

  async release(txSig: string): Promise<void> {
    this.store.delete(txSig);
  }

  private prune(): void {
    const now = Date.now();
    for (const [sig, exp] of this.store) {
      if (exp < now) this.store.delete(sig);
    }
  }
}

/**
 * Redis-backed replay store. Pass a redis client that supports SET NX EX.
 * Compatible with ioredis and node-redis (v4+).
 */
export class RedisReplayStore implements ReplayStore {
  constructor(
    private readonly redis: {
      set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
      del(key: string): Promise<unknown>;
    },
    private readonly ttlSeconds = 90_000,
  ) {}

  async claim(txSig: string): Promise<boolean> {
    const key    = `x402:tx:${txSig}`;
    const result = await this.redis.set(key, "1", "EX", this.ttlSeconds, "NX");
    return result === "OK";
  }

  async release(txSig: string): Promise<void> {
    await this.redis.del(`x402:tx:${txSig}`);
  }
}
