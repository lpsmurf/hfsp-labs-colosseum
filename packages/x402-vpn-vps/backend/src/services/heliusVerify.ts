// Verifies a Solana mainnet USDC transfer via Helius enhanced getTransaction.
// Returns the sender wallet so callers can apply agent-discount rules.

const HELIUS_RPC = process.env.HELIUS_RPC_URL;

export interface VerifyResult {
  ok:      boolean;
  error?:  string;
  txSig?:  string;
  amount?: number;
  from?:   string; // fee-payer / sender wallet address
}

export async function verifyHeliusTx(
  txSig: string,
  expectedMint: string,
  expectedTo: string,
  minAmount: bigint,
): Promise<VerifyResult> {
  try {
    const res = await fetch(HELIUS_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: [txSig, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 }],
      }),
    });
    const json = (await res.json()) as any;
    const tx = json?.result;
    if (!tx) return { ok: false, error: "tx not found or not yet confirmed" };

    if (tx.meta?.err) return { ok: false, error: `tx failed on-chain: ${JSON.stringify(tx.meta.err)}` };

    // Fee-payer is the first account in the static account keys list
    const from: string =
      tx.transaction?.message?.accountKeys?.[0]?.pubkey ??
      tx.transaction?.message?.staticAccountKeys?.[0] ??
      "";

    // Scan postTokenBalances / preTokenBalances for USDC transfer to expectedTo
    const pre  = (tx.meta?.preTokenBalances  ?? []) as any[];
    const post = (tx.meta?.postTokenBalances ?? []) as any[];

    for (const postBal of post) {
      if (postBal.mint !== expectedMint) continue;
      const preBal  = pre.find(p => p.accountIndex === postBal.accountIndex);
      const preAmt  = BigInt(preBal?.uiTokenAmount?.amount ?? "0");
      const postAmt = BigInt(postBal.uiTokenAmount.amount);
      const delta   = postAmt - preAmt;

      if (delta < minAmount) continue;

      const owner = postBal.owner ?? "";
      if (owner !== expectedTo) continue;

      return { ok: true, txSig, amount: Number(delta), from };
    }

    return { ok: false, error: `no USDC transfer of ≥${minAmount} to ${expectedTo} found in tx`, from };
  } catch (e: any) {
    return { ok: false, error: `helius rpc error: ${e?.message}` };
  }
}
