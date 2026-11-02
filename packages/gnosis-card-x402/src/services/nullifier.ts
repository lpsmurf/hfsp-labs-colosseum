import { Redis } from 'ioredis';
import { config } from '../config.js';

// Losing Redis must never make a spent payment spendable. No memory fallback.
const redis = new Redis(config.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
redis.on('error', () => {});
const key = (signature: string) => `nullifier:${signature.startsWith('0x') ? signature.toLowerCase() : signature}`;

export async function assertPaymentStoreReady(): Promise<void> { await redis.ping(); }

// Keep the old namespace to honor pre-upgrade claims. No TTL: an uncertain
// submission must never become eligible for automatic payout again.
export async function claimPayment(signature: string, order: unknown): Promise<boolean> {
  return await redis.set(key(signature), JSON.stringify({ state: 'processing', order, createdAt: Date.now() }), 'NX') === 'OK';
}

// Atomically drop a claim only if nothing was broadcast for it, so a payment
// whose order failed before submission can be retried. Once a submission is
// recorded the claim is permanent.
const RELEASE_IF_UNSUBMITTED = `
if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
return redis.call('DEL', KEYS[1])`;

export async function releaseUnsubmittedPayment(signature: string): Promise<boolean> {
  const k = key(signature);
  return await redis.eval(RELEASE_IF_UNSUBMITTED, 2, k, `${k}:submission`) === 1;
}

export async function recordSubmission(signature: string, sourceTx: string): Promise<void> {
  await redis.set(`${key(signature)}:submission`, sourceTx);
}

export async function completePayment(signature: string, result: unknown): Promise<void> {
  await redis.set(`${key(signature)}:result`, JSON.stringify(result));
}
