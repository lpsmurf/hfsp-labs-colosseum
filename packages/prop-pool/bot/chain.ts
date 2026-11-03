/**
 * Read-only chain helpers for the bot. No signer — the bot only reads Prop /
 * Position accounts and builds Mini App links; all writes happen in the webview.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { PKG } from "./config";

const idl = JSON.parse(readFileSync(resolve(PKG, "idl/prop_pool.json"), "utf8"));

export function readProgram(connection: Connection): Program {
  // A throwaway read-only wallet — never used to sign anything.
  const provider = new AnchorProvider(connection, new Wallet(Keypair.generate()), { commitment: "confirmed" });
  return new Program(idl, provider);
}

function decodeAll(program: Program, name: string, raw: { pubkey: PublicKey; account: { data: Buffer } }[]) {
  const out: { publicKey: PublicKey; account: any }[] = [];
  for (const { pubkey, account } of raw) {
    try {
      out.push({ publicKey: pubkey, account: program.coder.accounts.decode(name, account.data) });
    } catch {
      /* stale layout — skip */
    }
  }
  return out;
}

export async function allProps(program: Program, connection: Connection) {
  const filters = [{ memcmp: (program.coder.accounts as any).memcmp("prop") }];
  return decodeAll(program, "prop", await connection.getProgramAccounts(program.programId, { filters }) as any);
}

/** Positions owned by a wallet. Position layout: disc(8) prop(32) user(32) → user at offset 40. */
export async function positionsForWallet(program: Program, connection: Connection, wallet: PublicKey) {
  const filters = [
    { memcmp: (program.coder.accounts as any).memcmp("position") },
    { memcmp: { offset: 40, bytes: wallet.toBase58() } },
  ];
  return decodeAll(program, "position", await connection.getProgramAccounts(program.programId, { filters }) as any);
}

export async function fetchProp(program: Program, prop: PublicKey): Promise<any | null> {
  try {
    return await (program.account as any).prop.fetch(prop);
  } catch {
    return null;
  }
}

export const isStatus = (status: any, name: string) =>
  status && Object.prototype.hasOwnProperty.call(status, name);
