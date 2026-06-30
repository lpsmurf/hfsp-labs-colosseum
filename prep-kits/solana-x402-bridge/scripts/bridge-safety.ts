// Mandatory preflight. Fail loud; never silently proceed.
import { getHealthyConnection } from "./rpc-health.js";
import type { SafetyResult } from "./types.js";

export async function preflight(amount: number, chain: string): Promise<SafetyResult> {
  const failures: string[] = [];
  const allow = (process.env.DEST_ALLOWLIST ?? "").split(",").map((s) => s.trim());
  const maxTx = Number(process.env.MAX_BRIDGE_USDC_PER_TX ?? 100);

  if (!allow.includes(chain)) failures.push(`destination '${chain}' not in allowlist`);
  if (amount > maxTx) failures.push(`amount ${amount} exceeds per-tx cap ${maxTx}`);

  const { connection, slotLag, endpoint } = await getHealthyConnection();
  const maxLag = Number(process.env.RPC_MAX_SLOT_LAG ?? 150);
  if (slotLag > maxLag) failures.push(`RPC slot-lag ${slotLag} > ${maxLag} (stale state)`);

  // TODO(devin): daily-cap accounting (persist 24h rolling total), min amountOut / slippage check,
  //              and post-execute confirmation monitor on both chains.
  return { ok: failures.length === 0, failures, rpcSlotLag: slotLag, usedRpc: endpoint };
}
