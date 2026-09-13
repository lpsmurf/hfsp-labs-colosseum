// Pricing and fulfilment shared by every Celo payment rail — x402 (agents) and
// the tagged-transfer checkout (wallets that cannot sign x402, e.g. MiniPay).
import env from "../config.js";
import { celoEnv } from "../celoConfig.js";
import { crPhase1, type CrOrderBody } from "./cryptorefills.js";
import { payAndFulfillBase } from "./payBase.js";
import { quoteExactOutput, executeBridge } from "./relay.js";
import { baseUsdcBalance, type CeloAsset } from "./evm.js";
import { redis } from "./redis.js";
import { recordReconciliation, type PriceLock } from "./celoState.js";

export type CeloOrderBody = Omit<CrOrderBody, "network">;

// Relay's exact-output quote moves between quote and execution; this margin is
// what keeps a re-quote at fulfilment inside what the buyer already paid.
const BRIDGE_SLIPPAGE_BPS = 100n;

const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;
const commission = (atomic: bigint) => ceilDiv(atomic * BigInt(Math.round(env.COMMISSION_RATE * 10_000)), 10_000n);

export class AssetUnavailable extends Error {}

/**
 * Price an order in a Celo stablecoin.
 *
 * With a float covering it: Cryptorefills price + commission. Without: the live
 * bridge input (plus slippage margin) + commission, so a small order never costs
 * us more than it earns.
 */
export async function priceOrder(body: CeloOrderBody, asset: CeloAsset): Promise<PriceLock> {
  const cr = await crPhase1({ ...body, network: "base" });
  const useFloat = celoEnv.STORE_FLOAT_MODE && (await baseUsdcBalance()) >= cr.crAmount;
  let bridgeAtomic = 0n;
  if (!useFloat) {
    try {
      const quote = await quoteExactOutput(asset, cr.crAmount);
      bridgeAtomic = ceilDiv(quote.amountIn * (10_000n + BRIDGE_SLIPPAGE_BPS), 10_000n);
    } catch (error) {
      // Bridge routes come and go per asset and size (Celo USDC → Base had none
      // for small orders on 2026-09-13).
      if (error instanceof Error && /no routes found/i.test(error.message)) throw new AssetUnavailable(asset);
      throw error;
    }
  }
  const base = useFloat ? cr.crAmount : bridgeAtomic;
  return {
    asset,
    priceAtomic: (base + commission(cr.crAmount)).toString(),
    crAtomic: cr.crAmount.toString(),
    bridgeAtomic: bridgeAtomic.toString(),
    float: useFloat,
    quotedAt: Date.now(),
  };
}

export interface PaidOrder {
  rail: "x402" | "checkout";
  tx: string;
  payer?: string;
  integrator?: string;
}

/**
 * Deliver an order that has already been paid on Celo.
 *
 * Never retried automatically: a second attempt after an uncertain purchase could
 * buy the product twice. Failures are recorded for reconciliation and rethrown.
 */
export async function fulfilPaidOrder(body: CeloOrderBody, lock: PriceLock, paid: PaidOrder) {
  const record = { ...paid, asset: lock.asset, paidAtomic: lock.priceAtomic };
  try {
    // Re-quote: the Cryptorefills session from pricing may have aged out.
    const fresh = await crPhase1({ ...body, network: "base" });
    const budget = BigInt(lock.priceAtomic) - commission(BigInt(lock.crAtomic));
    let bridge: Awaited<ReturnType<typeof executeBridge>> | undefined;

    if (!lock.float || (await baseUsdcBalance()) < fresh.crAmount) {
      const quote = await quoteExactOutput(lock.asset, fresh.crAmount);
      if (quote.amountIn > budget) throw new Error(`bridge now costs ${quote.amountIn}, budget ${budget}`);
      bridge = await executeBridge(quote);
    }

    const result = await payAndFulfillBase(body as CrOrderBody, fresh.sessionId, fresh.paymentRequired, budget);
    await redis.lpush("store:celo:orders", JSON.stringify({
      at: new Date().toISOString(), ...record, crAtomic: fresh.crAmount.toString(), bridge: bridge?.requestId,
    }));
    return { result, bridge };
  } catch (error) {
    await recordReconciliation({ ...record, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}
