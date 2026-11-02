// Background fulfilment for paid Celo orders.
//
// A paid order takes minutes (swap, bridge, supplier purchase) and the supplier
// then needs up to ~15 minutes to deliver. Holding the buyer's HTTP request open
// for that drops on many networks, so both rails answer as soon as the payment
// is verified and fulfil here, reporting progress through getProgress().
//
// Fulfilments run one at a time: they all spend from the same operator wallet,
// and parallel sends would race on nonces and on the USDT balance check.
import { redis } from "./redis.js";
import { getOrder } from "./cryptorefills.js";
import { fulfilPaidOrder, type CeloOrderBody, type PaidOrder } from "./celoFulfil.js";
import { recordReconciliation, type PriceLock } from "./celoState.js";
import { recordDelivered } from "./celoPopular.js";
export { publicResult } from "./crWire.js";

export type Stage = "fulfilling" | "delivering" | "delivered" | "failed";

export interface Progress {
  stage: Stage;
  supplierOrderId?: string;
  result?: unknown;
  error?: string;
  bridge?: string;
  productIds?: string[]; // for popularity counting when delivery completes later
  updatedAt: number; // ms
}

const JOB_TTL_SECONDS = 30 * 24 * 3600;
const ACTIVE = "store:celo:jobs:active";
const key = (id: string) => `store:celo:job:${id}`;
// How often a status read may ask the supplier for delivery state.
const SUPPLIER_POLL_MS = 15_000;

export const RECONCILE_MESSAGE =
  "Payment received; fulfilment needs a manual check. Contact info@hfsp.xyz with your transaction hash.";

async function write(id: string, progress: Omit<Progress, "updatedAt">): Promise<Progress> {
  const value = { ...progress, updatedAt: Date.now() };
  await redis.set(key(id), JSON.stringify(value), "EX", JOB_TTL_SECONDS);
  return value;
}

async function read(id: string): Promise<Progress | null> {
  const raw = await redis.get(key(id));
  return raw ? JSON.parse(raw) : null;
}

/** Map a Cryptorefills order status onto our stages. */
function stageFromSupplier(status: unknown): Stage {
  if (status === "completed") return "delivered";
  if (status === "failed" || status === "expired") return "failed";
  return "delivering";
}

let queue: Promise<void> = Promise.resolve();

/** Record the order as paid and fulfil it in the background. Returns immediately. */
export async function startFulfilment(id: string, body: CeloOrderBody, lock: PriceLock, paid: PaidOrder): Promise<Progress> {
  const progress = await write(id, { stage: "fulfilling" });
  await redis.sadd(ACTIVE, id);
  queue = queue.then(() => run(id, body, lock, paid));
  return progress;
}

async function run(id: string, body: CeloOrderBody, lock: PriceLock, paid: PaidOrder): Promise<void> {
  try {
    const { result, bridge } = await fulfilPaidOrder(body, lock, paid);
    const supplier = result as { order_id?: string; status?: unknown };
    const stage = stageFromSupplier(supplier?.status);
    const productIds = body.items.map(i => i.product_id);
    await write(id, {
      stage,
      supplierOrderId: supplier?.order_id,
      result,
      bridge: bridge?.requestId,
      productIds,
    });
    if (stage === "delivered")
      await recordDelivered(id, productIds).catch(() => {});
  } catch {
    // fulfilPaidOrder has already written the reconciliation record.
    await write(id, { stage: "failed", error: RECONCILE_MESSAGE }).catch(() => {});
  } finally {
    await redis.srem(ACTIVE, id).catch(() => {});
  }
}

/** Current progress, refreshing delivery state from the supplier when due. */
export async function getProgress(id: string): Promise<Progress | null> {
  const progress = await read(id);
  if (!progress || progress.stage !== "delivering" || !progress.supplierOrderId) return progress;
  if (Date.now() - progress.updatedAt < SUPPLIER_POLL_MS) return progress;

  const supplier = await getOrder(progress.supplierOrderId).catch(() => null) as { status?: unknown } | null;
  if (!supplier) return progress;
  const stage = stageFromSupplier(supplier.status);
  const next = await write(id, {
    ...progress,
    stage,
    result: supplier,
    error: stage === "failed" ? `The supplier could not deliver this order. ${RECONCILE_MESSAGE}` : undefined,
  });
  if (stage === "delivered" && progress.productIds?.length)
    await recordDelivered(id, progress.productIds).catch(() => {});
  return next;
}

/**
 * Orders that were mid-fulfilment when the process stopped. Where they stopped
 * is unknown (the swap or bridge may have gone through), so they are never
 * resumed automatically: each goes to reconciliation for a human.
 */
export async function sweepInterrupted(): Promise<number> {
  const ids = await redis.smembers(ACTIVE);
  for (const id of ids) {
    const progress = await read(id);
    if (progress?.stage === "fulfilling") {
      await write(id, { stage: "failed", error: RECONCILE_MESSAGE });
      await recordReconciliation({ job: id, error: "store restarted during fulfilment" });
    }
    await redis.srem(ACTIVE, id);
  }
  return ids.length;
}
