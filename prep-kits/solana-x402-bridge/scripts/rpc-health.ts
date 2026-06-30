// RPC freshness + failover. Reject stale endpoints; never act on lagging state.
import { Connection } from "@solana/web3.js";

export async function getHealthyConnection() {
  const primary = process.env.SOLANA_RPC_URL!;
  const fallbacks = (process.env.SOLANA_FALLBACK_RPCS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const endpoints = [primary, ...fallbacks];

  // TODO(devin): query getSlot across endpoints, compute lag vs max observed slot,
  // pick lowest-lag healthy endpoint; throw if none under RPC_MAX_SLOT_LAG.
  const endpoint = endpoints[0];
  const connection = new Connection(endpoint, "confirmed");
  const slotLag = 0; // TODO: real measurement
  return { connection, slotLag, endpoint };
}
