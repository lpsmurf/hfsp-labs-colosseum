import { Connection } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import type { Txoracle } from "./idl/txoracle";
import { idlForNetwork, networkConfig, type Network, type NetworkConfig } from "./config";

/**
 * Construct a typed `Program<Txoracle>` for a given network. The IDL's address
 * is set from the network config (see config.ts) before the Program is built,
 * so `program.programId` is correct for devnet vs mainnet.
 */
export function loadProgram(
  provider: AnchorProvider,
  network: Network = "devnet"
): Program<Txoracle> {
  const cfg = networkConfig(network);
  return new Program<Txoracle>(idlForNetwork(cfg), provider);
}

/**
 * Build an AnchorProvider from a Connection + Wallet. Convenience for callers
 * that aren't running under `anchor` and so can't use `AnchorProvider.env()`.
 */
export function makeProvider(
  connection: Connection,
  wallet: Wallet,
  opts = AnchorProvider.defaultOptions()
): AnchorProvider {
  return new AnchorProvider(connection, wallet, opts);
}

/** Build both a Connection-backed provider and a Program in one call. */
export function connect(
  wallet: Wallet,
  network: Network = "devnet",
  cfg: NetworkConfig = networkConfig(network)
): { provider: AnchorProvider; program: Program<Txoracle>; cfg: NetworkConfig } {
  const connection = new Connection(cfg.rpcUrl, "confirmed");
  const provider = makeProvider(connection, wallet);
  const program = loadProgram(provider, network);
  return { provider, program, cfg };
}
