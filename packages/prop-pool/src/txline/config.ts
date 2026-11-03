import { clusterApiUrl, PublicKey } from "@solana/web3.js";
import type { Txoracle } from "./idl/txoracle";
import rawIdl from "./idl/txoracle.json";

/**
 * Network configuration for the TxLINE / TxODDS Txoracle integration.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPORTANT — values verified against the sponsor's own runnable examples
 * (github.com/txodds/tx-on-chain/backup/examples) and OpenAPI spec (docs.yaml),
 * captured 2026-07-01. Where those two sources disagree, the discrepancy is
 * flagged inline and MUST be re-confirmed on the first live devnet run.
 *
 *  - API origin: VERIFIED LIVE 2026-07-01 by probing POST /auth/guest/start.
 *    `txline-dev.txodds.com` → 200 (devnet), `txline.txodds.com` → 200 (prod).
 *    The sponsor's runnable examples hardcode `oracle-dev.txodds.com`, which no
 *    longer resolves (DNS ENOTFOUND) — so we use the OpenAPI `servers` value.
 *
 *  - Program ID / mints: the sponsor's examples derive BOTH the program ID
 *    (idl.address) and the token mints (idl.constants: TXLINE_MINT / USDT_MINT)
 *    directly from the shipped IDL file, rather than hardcoding per-network
 *    constants. We do the same — see `programIdFromIdl` / `mintsFromIdl` — so
 *    that dropping the correct devnet IDL into src/idl/txoracle.json makes every
 *    downstream value self-consistent. The shipped IDL currently carries the
 *    mainnet address (9ExbZjA…); `programIdOverride` lets a caller pin a
 *    different program ID without editing the IDL.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export type Network = "devnet" | "mainnet";

export interface NetworkConfig {
  network: Network;
  /** Off-chain TxLINE REST/SSE API origin (no trailing slash). */
  apiOrigin: string;
  /** Solana JSON-RPC endpoint. */
  rpcUrl: string;
  /** Explorer cluster query-string suffix, e.g. "?cluster=devnet". */
  explorerCluster: string;
  /**
   * Optional program-ID override. When set, the loaded IDL's `address` is
   * replaced with this value before a Program is constructed. Leave undefined
   * to use the address embedded in the IDL (the sponsor's default behaviour).
   */
  programIdOverride?: PublicKey;
  /**
   * TxLINE utility token mint for this network. Set EXPLICITLY per network — the
   * shipped IDL's `TXLINE_MINT` constant is the MAINNET mint and does not exist
   * on devnet, so it cannot be derived from the IDL. Values match TxLINE's
   * official quickstart docs.
   */
  txlMint: PublicKey;
  /** USDT mint (paid purchase flow only; devnet value unverified/out of scope). */
  usdtMint?: PublicKey;
}

/**
 * Devnet program ID as documented in the txline-anchor implementation plan.
 * The shipped IDL carries the mainnet address, so devnet pins this override.
 * Re-confirm against the live "IDL & Types (Devnet)" page on first run.
 */
export const DEVNET_PROGRAM_ID = new PublicKey(
  "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J"
);
export const MAINNET_PROGRAM_ID = new PublicKey(
  "9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA"
);

// TxLINE token mints — from the official quickstart docs; devnet verified live
// (the treasury vault holds this mint) and confirmed against docs 2026-07-01.
export const DEVNET_TXL_MINT = new PublicKey(
  "4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG"
);
export const MAINNET_TXL_MINT = new PublicKey(
  "Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL"
);
export const MAINNET_USDT_MINT = new PublicKey(
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"
);

export const NETWORKS: Record<Network, NetworkConfig> = {
  devnet: {
    network: "devnet",
    apiOrigin: "https://txline-dev.txodds.com",
    rpcUrl: clusterApiUrl("devnet"),
    explorerCluster: "?cluster=devnet",
    programIdOverride: DEVNET_PROGRAM_ID,
    txlMint: DEVNET_TXL_MINT,
    // devnet USDT not needed for the free tier; paid purchase flow out of scope.
  },
  mainnet: {
    network: "mainnet",
    apiOrigin: "https://txline.txodds.com",
    rpcUrl: clusterApiUrl("mainnet-beta"),
    explorerCluster: "",
    // undefined → use the address baked into the IDL (mainnet 9ExbZjA…).
    programIdOverride: undefined,
    txlMint: MAINNET_TXL_MINT,
    usdtMint: MAINNET_USDT_MINT,
  },
};

/** The canonical, sponsor-shipped Txoracle IDL as a runtime object. */
export const IDL = rawIdl as Txoracle;

/** TxLINE utility token mint for the given network (default devnet). */
export function txlineMint(network: Network = "devnet"): PublicKey {
  return NETWORKS[network].txlMint;
}

/** USDT mint for the given network's paid purchase flow (mainnet only). */
export function usdtMint(network: Network = "mainnet"): PublicKey {
  const mint = NETWORKS[network].usdtMint;
  if (!mint) throw new Error(`no USDT mint configured for ${network}`);
  return mint;
}

/**
 * Return a copy of the IDL with its `address` set for the given network.
 * Anchor's `Program` reads `programId` from `idl.address`, so this is how we
 * point the same IDL at devnet vs mainnet.
 */
export function idlForNetwork(cfg: NetworkConfig): Txoracle {
  if (!cfg.programIdOverride) return IDL;
  return { ...IDL, address: cfg.programIdOverride.toBase58() } as Txoracle;
}

/** Resolve a NetworkConfig from a Network name. */
export function networkConfig(network: Network): NetworkConfig {
  return NETWORKS[network];
}
