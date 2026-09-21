// Cross-chain RPC health switcher. Detects lagging/failing endpoints and fails over
// BEFORE execution — on both the Solana source and the EVM destination.
// Never act on a stale/unhealthy RPC.
import { Connection } from "@solana/web3.js";

const TIMEOUT_MS = Number(process.env.RPC_PROBE_TIMEOUT_MS ?? 2500);

async function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("rpc timeout")), TIMEOUT_MS)),
  ]);
}

// ---------- Solana ----------
export async function getHealthySolana() {
  const endpoints = [process.env.SOLANA_RPC_URL!, ...split(process.env.SOLANA_FALLBACK_RPCS)];
  const maxLag = Number(process.env.RPC_MAX_SLOT_LAG ?? 150);

  const probes = await Promise.all(endpoints.map(async (url) => {
    const t0 = Date.now();
    try {
      const slot = await withTimeout(new Connection(url, "confirmed").getSlot());
      return { url, slot, latency: Date.now() - t0, ok: true as const };
    } catch { return { url, slot: -1, latency: Infinity, ok: false as const }; }
  }));

  const healthy = probes.filter((p) => p.ok);
  if (!healthy.length) throw new Error("No healthy Solana RPC endpoint");
  const maxSlot = Math.max(...healthy.map((p) => p.slot));
  const eligible = healthy
    .map((p) => ({ ...p, lag: maxSlot - p.slot }))
    .filter((p) => p.lag <= maxLag)
    .sort((a, b) => a.lag - b.lag || a.latency - b.latency);

  if (!eligible.length) throw new Error(`All Solana RPCs stale (> ${maxLag} slots behind)`);
  const best = eligible[0];
  return { connection: new Connection(best.url, "confirmed"), slotLag: best.lag, endpoint: best.url };
}

// Back-compat alias used by bridge-safety.
export const getHealthyConnection = getHealthySolana;

// ---------- EVM ----------
// Per-chain fallback RPCs via env, e.g. POLYGON_FALLBACK_RPCS, ETHEREUM_FALLBACK_RPCS.
export async function getHealthyEvmRpc(chain: string) {
  const primary = process.env[`${chain.toUpperCase()}_RPC_URL`];
  const fallbacks = split(process.env[`${chain.toUpperCase()}_FALLBACK_RPCS`]);
  const endpoints = [primary, ...fallbacks].filter(Boolean) as string[];
  if (!endpoints.length) throw new Error(`No RPC configured for ${chain}`);

  const probes = await Promise.all(endpoints.map(async (url) => {
    const t0 = Date.now();
    try {
      const block = await withTimeout(evmBlockNumber(url));
      return { url, block, latency: Date.now() - t0, ok: true as const };
    } catch { return { url, block: -1, latency: Infinity, ok: false as const }; }
  }));

  const healthy = probes.filter((p) => p.ok);
  if (!healthy.length) throw new Error(`No healthy ${chain} RPC endpoint`);
  const maxBlock = Math.max(...healthy.map((p) => p.block));
  const maxLag = Number(process.env.EVM_MAX_BLOCK_LAG ?? 10);
  const eligible = healthy
    .map((p) => ({ ...p, lag: maxBlock - p.block }))
    .filter((p) => p.lag <= maxLag)
    .sort((a, b) => a.lag - b.lag || a.latency - b.latency);

  if (!eligible.length) throw new Error(`All ${chain} RPCs stale (> ${maxLag} blocks behind)`);
  const best = eligible[0];
  return { endpoint: best.url, blockLag: best.lag, latency: best.latency };
}

async function evmBlockNumber(url: string): Promise<number> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
  });
  const json = await res.json();
  return parseInt(json.result, 16);
}

function split(v?: string) { return (v ?? "").split(",").map((s) => s.trim()).filter(Boolean); }
