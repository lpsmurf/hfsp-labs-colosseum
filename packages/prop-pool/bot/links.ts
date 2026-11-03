/**
 * Mini App deep-link builder. The bot pre-computes the deterministic prop PDA
 * (creator + nonce + fixture) and shares ONE card: the first tap (creator)
 * creates+stakes, later taps join. All signing happens in the webview.
 */
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

/** Empirically, final-time soccer stats carry period=4 in the anchored data
 *  (observed in M0). The creator must commit to the period that the settling
 *  proof will carry, so we default to full-time here. */
export const DEFAULT_PERIOD = 4;

export interface PropParams {
  creator: string; // wallet pubkey
  nonce: string; // u64 as string
  fixtureId: string; // i64 as string
  statKey: number;
  period: number;
  threshold: number;
  cmp: "lt" | "gt";
  mint: string; // stake mint
}

export function derivePropPda(programId: PublicKey, creator: PublicKey, fixtureId: string, nonce: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("prop"),
      new BN(fixtureId).toArrayLike(Buffer, "le", 8),
      creator.toBuffer(),
      new BN(nonce).toArrayLike(Buffer, "le", 8),
    ],
    programId
  )[0];
}

export function createLink(miniappUrl: string, prop: string, p: PropParams): string {
  const q = new URLSearchParams({
    mode: "create",
    prop,
    creator: p.creator,
    nonce: p.nonce,
    fixtureId: p.fixtureId,
    statKey: String(p.statKey),
    period: String(p.period),
    threshold: String(p.threshold),
    cmp: p.cmp,
    mint: p.mint,
  });
  return `${miniappUrl}?${q.toString()}`;
}

export function joinLink(miniappUrl: string, prop: string): string {
  return `${miniappUrl}?${new URLSearchParams({ mode: "join", prop }).toString()}`;
}
