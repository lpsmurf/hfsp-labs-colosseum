import type { VerifyResult } from "../types.js";

/**
 * Verifies a Solana USDC transfer using the standard JSON-RPC getTransaction call.
 * Works with any Solana RPC endpoint (Helius recommended for fast finality polling).
 *
 * Returns the sender (fee-payer) so callers can apply per-wallet pricing rules.
 */
export async function verifyTx(
  rpcUrl: string,
  txSig: string,
  expectedMint: string,
  expectedTo: string,
  minAmount: bigint,
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
