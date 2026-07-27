import type { VerifyResult } from "../types.js";
import { MEMO_PROGRAM_ID } from "../types.js";

/** Optional hardening checks layered on top of the base transfer verification. */
export interface VerifyOpts {
  /** Reject payments older than this many seconds (freshness window, R9). 0 disables. */
  maxAgeSeconds?: number;
  /** Require an SPL Memo equal to this id (resource binding, R2). */
  resourceId?: string;
  /** Clock-skew tolerance for blockTime in the future (seconds). Default 60. */
  clockSkewSeconds?: number;
}

/** Extract every SPL Memo string from a jsonParsed transaction (top-level + inner). */
function extractMemos(tx: any): string[] {
  const out: string[] = [];
  const scan = (ix: any) => {
    if (!ix) return;
    const isMemo = ix.programId === MEMO_PROGRAM_ID || ix.program === "spl-memo";
    if (!isMemo) return;
    // jsonParsed memos surface as a string in `parsed`; raw ones carry base64 `data`.
    if (typeof ix.parsed === "string") out.push(ix.parsed);
    else if (typeof ix.parsed?.info === "string") out.push(ix.parsed.info);
    else if (typeof ix.data === "string") {
      try { out.push(Buffer.from(ix.data, "base64").toString("utf8")); } catch { /* ignore */ }
    }
  };
  for (const ix of tx?.transaction?.message?.instructions ?? []) scan(ix);
  for (const inner of tx?.meta?.innerInstructions ?? []) for (const ix of inner.instructions ?? []) scan(ix);
  return out;
}

/**
 * Verifies a Solana USDC transfer using the standard JSON-RPC getTransaction call.
 * Works with any Solana RPC endpoint (Helius recommended for fast finality polling).
 *
 * Layers two x402 hardening checks on top of the transfer match:
 *   • freshness window (R9) — rejects stale payments via on-chain blockTime
 *   • resource binding (R2) — requires an SPL Memo == resourceId when configured
 *
 * Returns the sender (fee-payer) so callers can apply per-wallet pricing rules.
 */
export async function verifyTx(
  rpcUrl: string,
  txSig: string,
  expectedMint: string,
  expectedTo: string,
  minAmount: bigint,
  opts: VerifyOpts = {},
): Promise<VerifyResult> {
  try {
    const res = await fetch(rpcUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        jsonrpc: "2.0",
        id:      1,
        method:  "getTransaction",
        params:  [txSig, {
          encoding:                          "jsonParsed",
          commitment:                        "confirmed",
          maxSupportedTransactionVersion:    0,
        }],
      }),
    });

    const json = (await res.json()) as any;

    if (json?.error) {
      return { ok: false, error: `RPC error: ${JSON.stringify(json.error)}` };
    }

    const tx = json?.result;

    if (!tx) return { ok: false, error: "tx not found or not yet confirmed" };
    if (tx.meta?.err) return { ok: false, error: `tx failed on-chain: ${JSON.stringify(tx.meta.err)}` };

    // R9 — freshness window: a payment must be recent, so a stale tx (e.g. seen
    // for the first time after a replay-store restart) cannot be redeemed.
    const maxAge = opts.maxAgeSeconds ?? 300;
    if (maxAge > 0) {
      const blockTime: number | null = tx.blockTime ?? null;
      if (blockTime === null) return { ok: false, error: "tx has no blockTime; cannot enforce freshness" };
      const ageSec = Math.floor(Date.now() / 1000) - blockTime;
      const skew   = opts.clockSkewSeconds ?? 60;
      if (ageSec > maxAge)  return { ok: false, error: `payment too old: ${ageSec}s > ${maxAge}s freshness window` };
      if (ageSec < -skew)   return { ok: false, error: `payment blockTime is in the future (${-ageSec}s); rejecting` };
    }

    // R2 — resource binding: the payment must carry a memo == resourceId, so a
    // signature paid for one route cannot unlock another route of the same price.
    if (opts.resourceId) {
      const memos = extractMemos(tx);
      if (!memos.includes(opts.resourceId)) {
        return { ok: false, error: `payment not bound to this resource (missing memo "${opts.resourceId}")` };
      }
    }

    const from: string =
      tx.transaction?.message?.accountKeys?.[0]?.pubkey ??
      tx.transaction?.message?.staticAccountKeys?.[0]   ??
      "";

    const pre  = (tx.meta?.preTokenBalances  ?? []) as any[];
    const post = (tx.meta?.postTokenBalances ?? []) as any[];

    for (const postBal of post) {
      if (postBal.mint !== expectedMint) continue;

      const preBal  = pre.find((p: any) => p.accountIndex === postBal.accountIndex);
      const preAmt  = BigInt(preBal?.uiTokenAmount?.amount ?? "0");
      const postAmt = BigInt(postBal?.uiTokenAmount?.amount ?? "0");
      const delta   = postAmt - preAmt;

      if (delta < minAmount) continue;
      if ((postBal.owner ?? "") !== expectedTo) continue;

      return { ok: true, amount: Number(delta), from };
    }

    return { ok: false, error: `no USDC transfer ≥${minAmount} to ${expectedTo} found in tx`, from };
  } catch (e: any) {
    return { ok: false, error: `rpc error: ${e?.message}` };
  }
}
