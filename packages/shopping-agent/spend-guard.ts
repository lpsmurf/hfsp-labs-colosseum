/**
 * spend-guard.ts — the autonomous-spend guardrail.
 *
 * An agent that pays for its own LLM calls and purchases must NOT be able to
 * spend unbounded. Every outflow (inference micro-payment OR a product buy)
 * is checked here first. This is pure, synchronous policy logic so it is trivial
 * to unit-test and to reason about — no network, no wallet.
 *
 * Policy enforced:
 *   - per-transaction cap        (one buy can't exceed $X)
 *   - rolling 24h daily cap      (total outflow in any 24h window)
 *   - allowlist of merchants     (productLocator prefixes the agent may buy from)
 *   - human-confirm threshold    (buys above $Y require the user to approve)
 *
 * All amounts are atomic USDC (bigint, 6 decimals) to avoid float drift —
 * the same unit the @hfsp/x402-sdk settles in.
 */

import { fromAtomicUsdc } from "./providers.js";

export interface SpendCaps {
  /** Max for a single transaction. */
  perTxAtomic: bigint;
  /** Max cumulative outflow over any rolling 24h window. */
  dailyAtomic: bigint;
  /**
   * Buys at/above this need explicit user confirmation (email/Telegram).
   * Inference micro-payments are never subject to this — only purchases.
   */
  humanConfirmAtomic: bigint;
  /**
   * Allowed merchant prefixes for purchases, e.g. ["amazon:", "giftcard:"].
   * Inference payments (kind "inference") bypass the allowlist.
   */
  allowMerchantPrefixes: string[];
}

export type SpendKind = "inference" | "purchase";

export interface SpendRequest {
  kind: SpendKind;
  amountAtomic: bigint;
  /** For purchases: the productLocator being bought (checked against allowlist). */
  merchant?: string;
}

export type Decision =
  | { allow: true; requiresHumanConfirm: boolean }
  | { allow: false; reason: string; requiresHumanConfirm?: false };

interface Outflow {
  atAtomicMs: number;
  amount: bigint;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export class SpendGuard {
  private readonly ledger: Outflow[] = [];

  constructor(private readonly caps: SpendCaps, private readonly now: () => number = Date.now) {}

  /** Total committed in the trailing 24h (prunes old entries as a side effect). */
  spentLast24h(): bigint {
    const cutoff = this.now() - DAY_MS;
    while (this.ledger.length > 0 && this.ledger[0]!.atAtomicMs < cutoff) this.ledger.shift();
    return this.ledger.reduce((sum, o) => sum + o.amount, 0n);
  }

  /**
   * Decide whether a spend may proceed. Does NOT record it — call commit()
   * once the spend actually settles, so a denied/aborted buy doesn't burn budget.
   */
  check(req: SpendRequest): Decision {
    if (req.amountAtomic <= 0n) return { allow: false, reason: "non-positive amount" };

    if (req.amountAtomic > this.caps.perTxAtomic) {
      return {
        allow: false,
        reason: `per-tx cap exceeded: $${fromAtomicUsdc(req.amountAtomic)} > $${fromAtomicUsdc(this.caps.perTxAtomic)}`,
      };
    }

    const projected = this.spentLast24h() + req.amountAtomic;
    if (projected > this.caps.dailyAtomic) {
      return {
        allow: false,
        reason: `daily cap exceeded: $${fromAtomicUsdc(projected)} > $${fromAtomicUsdc(this.caps.dailyAtomic)} in 24h`,
      };
    }

    if (req.kind === "purchase") {
      const merchant = req.merchant ?? "";
      const allowed = this.caps.allowMerchantPrefixes.some((p) => merchant.startsWith(p));
      if (!allowed) {
        return { allow: false, reason: `merchant not allowlisted: "${merchant}"` };
      }
    }

    const requiresHumanConfirm =
      req.kind === "purchase" && req.amountAtomic >= this.caps.humanConfirmAtomic;

    return { allow: true, requiresHumanConfirm };
  }

  /** Record a settled spend against the rolling window. */
  commit(req: SpendRequest): void {
    this.ledger.push({ atAtomicMs: this.now(), amount: req.amountAtomic });
  }
}
