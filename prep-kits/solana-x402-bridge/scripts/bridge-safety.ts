// Mandatory preflight. Fail loud; never silently proceed.
// Checks BOTH chains' RPC health (source Solana + destination EVM) before any execution.
import { getHealthySolana, getHealthyEvmRpc } from "./rpc-health.js";
import type { SafetyResult } from "./types.js";

export async function preflight(srcToken: string, amountIn: number, chain: string, destToken: string): Promise<SafetyResult> {
  const failures: string[] = [];
  const allow = (process.env.DEST_ALLOWLIST ?? "").split(",").map((s) => s.trim());
  const maxTx = Number(process.env.MAX_BRIDGE_USDC_PER_TX ?? 100);

  if (!allow.includes(chain)) failures.push(`destination '${chain}' not in allowlist`);
  if (srcToken.toLowerCase() === "usdc" && amountIn > maxTx) failures.push(`amount ${amountIn} exceeds per-tx cap ${maxTx}`);

  // Source: Solana RPC health (lowest slot-lag healthy endpoint, else fail).
  let slotLag = -1, usedRpc = "";
  try { const s = await getHealthySolana(); slotLag = s.slotLag; usedRpc = s.endpoint; }
  catch (e) { failures.push(`Solana RPC: ${(e as Error).message}`); }

  // Destination: EVM RPC health (auto-failover; fail if all stale/unreachable).
  try { await getHealthyEvmRpc(chain); }
  catch (e) { failures.push(`${chain} RPC: ${(e as Error).message}`); }

  // TODO(devin): daily-cap accounting; for swaps (srcToken!=destToken) enforce minAmountOut /
  //              slippage tolerance + re-quote before execute; post-execute confirmation on both chains.
  return { ok: failures.length === 0, failures, rpcSlotLag: slotLag, usedRpc };
}
