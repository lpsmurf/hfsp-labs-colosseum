// Cross-chain RPC health switcher. Detects lagging/failing endpoints and fails over
// BEFORE execution — on both the Solana source and the EVM destination.
// Never act on a stale/unhealthy RPC.
import "./env.js";
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
  const chosen = selectPreferringPrimary(eligible, endpoints[0]);
  return { connection: new Connection(chosen.url, "confirmed"), slotLag: chosen.lag, endpoint: chosen.url };
}

// Back-compat alias used by bridge-safety.
export const getHealthyConnection = getHealthySolana;

// ---------- EVM ----------
// Reliable keyless public RPC defaults so the skill works out of the box. Any user-configured
// <CHAIN>_RPC_URL / <CHAIN>_FALLBACK_RPCS is always preferred over these.
const DEFAULT_EVM_RPCS: Record<string, string[]> = {
  ethereum: ["https://ethereum-rpc.publicnode.com"],
  polygon:  ["https://polygon-bor-rpc.publicnode.com"],
  base:     ["https://base-rpc.publicnode.com"],
  arbitrum: ["https://arbitrum-one-rpc.publicnode.com"],
  optimism: ["https://optimism-rpc.publicnode.com"],
  gnosis:   ["https://gnosis-rpc.publicnode.com"],
};

// Per-chain fallback RPCs via env, e.g. POLYGON_FALLBACK_RPCS, ETHEREUM_FALLBACK_RPCS.
export async function getHealthyEvmRpc(chain: string) {
  const primary = process.env[`${chain.toUpperCase()}_RPC_URL`];
  const fallbacks = split(process.env[`${chain.toUpperCase()}_FALLBACK_RPCS`]);
  const endpoints = [primary, ...fallbacks, ...(DEFAULT_EVM_RPCS[chain.toLowerCase()] ?? [])].filter(Boolean) as string[];
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
  const chosen = selectPreferringPrimary(eligible, endpoints[0]);
  return { endpoint: chosen.url, blockLag: chosen.lag, latency: chosen.latency };
}

// Prefer the configured primary endpoint when it's healthy AND within lag tolerance — so a
// reliable (paid) RPC isn't bypassed just because a public node pinged a few ms faster. Only
// fail over to the best-ranked fallback when the primary is unhealthy/stale. Set
// RPC_PREFER_PRIMARY=false for pure lowest-lag/latency selection across all endpoints.
function selectPreferringPrimary<T extends { url: string }>(eligible: T[], primaryUrl: string): T {
  const preferPrimary = (process.env.RPC_PREFER_PRIMARY ?? "true") !== "false";
  return (preferPrimary && eligible.find((e) => e.url === primaryUrl)) || eligible[0];
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

// ---------- CLI ----------
// usage: tsx scripts/rpc-health.ts [chain]   (default: solana)
//   tsx scripts/rpc-health.ts solana
//   tsx scripts/rpc-health.ts polygon
// Prints the selected healthy endpoint + lag. API keys are redacted from output.
if (import.meta.url === `file://${process.argv[1]}`) {
  const redact = (u: string) => u.replace(/(api-key=)[^&\s]+/i, "$1***").replace(/(\/v2\/)[^/\s]+/i, "$1***");
  const chain = (process.argv[2] ?? "solana").toLowerCase();
  (async () => {
    try {
      if (chain === "solana" || chain === "sol") {
        const s = await getHealthySolana();
        console.log(`[solana] OK -> ${redact(s.endpoint)}  slotLag=${s.slotLag}`);
      } else {
        const e = await getHealthyEvmRpc(chain);
        console.log(`[${chain}] OK -> ${redact(e.endpoint)}  blockLag=${e.blockLag}  latency=${e.latency}ms`);
      }
    } catch (err) {
      console.error(`[${chain}] UNHEALTHY: ${(err as Error).message}`);
      process.exit(1);
    }
  })();
}
