/**
 * Build + submit a `settle()` transaction for one prop, CPI-ing into
 * txoracle::validate_stat. Idempotent at the program level (double-settle reverts).
 */
import { ComputeBudgetProgram, Connection, PublicKey } from "@solana/web3.js";
import { BN, Program } from "@coral-xyz/anchor";
import {
  deriveDailyScoresPda,
  epochDayFromMs,
  batchTimestamp,
  buildScoresBatchSummary,
  buildStatTerm,
  toProofNodes,
} from "../src/txline/index";
import type { ScoresStatValidation } from "../src/txline/index";
import { log } from "./logger";

export const TXORACLE = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");

export function explorer(sig: string): string {
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}

export interface SettleResult {
  signature: string;
  dailyScoresPda: string;
}

/** Submit settle() for `propPubkey` using the supplied validation proof. */
export async function settleProp(
  program: Program,
  connection: Connection,
  propPubkey: PublicKey,
  prop: any,
  v: ScoresStatValidation,
  computeUnits: number
): Promise<SettleResult> {
  const batchTs = batchTimestamp(v);
  const epochDay = epochDayFromMs(batchTs);
  const dailyScoresPda = deriveDailyScoresPda(TXORACLE, epochDay);

  // The daily root must exist before we can settle (else txoracle reverts).
  const rootInfo = await connection.getAccountInfo(dailyScoresPda);
  if (!rootInfo) throw new Error(`daily root not yet posted for epochDay ${epochDay}`);

  const statA = buildStatTerm(v.statToProve, v.eventStatRoot, v.statProof);
  const statB =
    prop.statKeyB != null && v.statToProve2
      ? buildStatTerm(v.statToProve2, v.eventStatRoot, v.statProof2 ?? [])
      : null;

  const signature = await program.methods
    .settle(
      new BN(batchTs),
      buildScoresBatchSummary(v.summary),
      toProofNodes(v.subTreeProof),
      toProofNodes(v.mainTreeProof),
      statA,
      statB,
      prop.op ?? null
    )
    .accounts({
      prop: propPubkey,
      dailyScoresMerkleRoots: dailyScoresPda,
      txoracleProgram: TXORACLE,
      settler: program.provider.publicKey,
    })
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits })])
    .rpc();

  log.info("settled", { prop: propPubkey.toBase58(), tx: explorer(signature) });
  return { signature, dailyScoresPda: dailyScoresPda.toBase58() };
}
