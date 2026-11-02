// Integrator revenue-share ledger.
//
// An integrator (an app, bot or agent that routes buyers to us under its
// ERC-8004 id, sent as X-Integrator) earns a share of the commission we take on
// the orders it brings. This records the accrual per fulfilled order; payouts
// are a separate, deliberate step, and the hackathon's "independent buyers only"
// rule is applied then, using the payer recorded on each entry — so nothing here
// pays out our own wallets by mistake.
//
// Amounts are atomic USDC (6 decimals). One entry per order tx (idempotent), so
// a retry or a re-read never double-credits.
import { redis } from "./redis.js";
import { SHARE_BPS, revenueShare } from "./celoShare.js";
export { revenueShare } from "./celoShare.js";

const ENTRY_TTL_SECONDS = 180 * 24 * 3600;

const owedKey = (id: string) => `store:celo:ledger:owed:${id}`;
const entryKey = (id: string) => `store:celo:ledger:entries:${id}`;
const seenKey = (tx: string) => `store:celo:ledger:seen:${tx}`;


export interface LedgerEntry {
  tx: string;
  payer?: string;
  asset: string;
  commissionAtomic: string;
  shareAtomic: string;
  at: string;
}

/**
 * Credit an integrator for one fulfilled order. Idempotent on the order tx:
 * the first call books it, later calls for the same tx are ignored.
 */
export async function creditIntegrator(
  integrator: string,
  order: { tx: string; payer?: string; asset: string; commissionAtomic: bigint },
): Promise<void> {
  const share = revenueShare(order.commissionAtomic);
  if (share <= 0n) return;

  // NX guard keyed on the order tx: bill each order at most once.
  const first = await redis.set(seenKey(order.tx), integrator, "EX", ENTRY_TTL_SECONDS, "NX");
  if (first !== "OK") return;

  const entry: LedgerEntry = {
    tx: order.tx,
    payer: order.payer,
    asset: order.asset,
    commissionAtomic: order.commissionAtomic.toString(),
    shareAtomic: share.toString(),
    at: new Date().toISOString(),
  };
  await redis.multi()
    .incrby(owedKey(integrator), Number(share))
    .lpush(entryKey(integrator), JSON.stringify(entry))
    .ltrim(entryKey(integrator), 0, 999)
    .expire(entryKey(integrator), ENTRY_TTL_SECONDS)
    .expire(owedKey(integrator), ENTRY_TTL_SECONDS)
    .exec();
}

export interface IntegratorSummary {
  integrator: string;
  owedAtomic: string;
  owedUsdc: string;
  orders: number;
  shareBps: number;
  recent: Array<Pick<LedgerEntry, "at" | "asset" | "shareAtomic"> & { payer?: string }>;
}

/** What an integrator may read about its own accrued share. No buyer contact details. */
export async function integratorSummary(integrator: string): Promise<IntegratorSummary> {
  const [owed, raw] = await Promise.all([
    redis.get(owedKey(integrator)),
    redis.lrange(entryKey(integrator), 0, 19),
  ]);
  const owedAtomic = BigInt(owed ?? "0");
  const entries = raw.map(r => JSON.parse(r) as LedgerEntry);
  return {
    integrator,
    owedAtomic: owedAtomic.toString(),
    owedUsdc: (Number(owedAtomic) / 1e6).toFixed(6),
    orders: await redis.llen(entryKey(integrator)),
    shareBps: Number(SHARE_BPS),
    // Payer is masked to a prefix: enough to prove independence to the integrator
    // without publishing the full buyer address on a public status route.
    recent: entries.map(e => ({ at: e.at, asset: e.asset, shareAtomic: e.shareAtomic, payer: e.payer ? `${e.payer.slice(0, 6)}…${e.payer.slice(-4)}` : undefined })),
  };
}
