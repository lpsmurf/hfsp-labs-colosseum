/**
 * Browser-side prop_pool client (create / join / claim) using Anchor + the
 * wallet-adapter wallet. Devnet only.
 */
import { AnchorProvider, BN, Program, type Idl } from "@coral-xyz/anchor";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import rawIdl from "./idl/prop_pool.json";

const idl = rawIdl as Idl;
const RENT = new PublicKey("SysvarRent111111111111111111111111111111111");

export interface CreateParams {
  prop: string;
  creator: string;
  nonce: string;
  fixtureId: string;
  statKey: number;
  period: number;
  threshold: number;
  cmp: "lt" | "gt";
  mint: string;
}

export function getProgram(connection: Connection, wallet: AnchorWallet): Program {
  return new Program(idl, new AnchorProvider(connection, wallet, { commitment: "confirmed" }));
}

const cmpArg = (cmp: "lt" | "gt") => (cmp === "gt" ? { greaterThan: {} } : { lessThan: {} });

function pdas(program: Program, propPk: PublicKey, user: PublicKey) {
  const [vault] = PublicKey.findProgramAddressSync([Buffer.from("vault"), propPk.toBuffer()], program.programId);
  const [position] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), propPk.toBuffer(), user.toBuffer()],
    program.programId
  );
  return { vault, position };
}

/** Creator flow: create_prop + join in one transaction. `amount` in USDC base units. */
export async function createAndJoin(
  program: Program,
  p: CreateParams,
  side: boolean,
  amount: number
): Promise<string> {
  const user = program.provider.publicKey!;
  const propPk = new PublicKey(p.prop);
  const mint = new PublicKey(p.mint);
  const { vault, position } = pdas(program, propPk, user);
  const userAta = getAssociatedTokenAddressSync(mint, user);

  const now = Math.floor(Date.now() / 1000);
  const epochDay = Math.floor(Date.now() / 86_400_000);

  const createIx = await program.methods
    .createProp({
      nonce: new BN(p.nonce),
      fixtureId: new BN(p.fixtureId),
      statKey: p.statKey,
      period: p.period,
      statKeyB: null,
      op: null,
      threshold: p.threshold,
      comparison: cmpArg(p.cmp),
      expectedEpochDay: epochDay,
      minDeposit: new BN(1_000_000),
      joinDeadline: new BN(now + 7200),
      settleAfter: new BN(now + 7200),
      creatorSide: side,
    })
    .accounts({
      prop: propPk, vault, creator: user, stakeMint: mint,
      systemProgram: SystemProgram.programId, tokenProgram: TOKEN_PROGRAM_ID, rent: RENT,
    })
    .instruction();

  return program.methods
    .join(side, new BN(amount))
    .accounts({
      prop: propPk, vault, position, user, userTokenAccount: userAta,
      systemProgram: SystemProgram.programId, tokenProgram: TOKEN_PROGRAM_ID,
    })
    .preInstructions([createIx])
    .rpc();
}

/** Join an existing prop. */
export async function joinProp(program: Program, propPk: PublicKey, mint: PublicKey, side: boolean, amount: number) {
  const user = program.provider.publicKey!;
  const { vault, position } = pdas(program, propPk, user);
  const userAta = getAssociatedTokenAddressSync(mint, user);
  return program.methods
    .join(side, new BN(amount))
    .accounts({
      prop: propPk, vault, position, user, userTokenAccount: userAta,
      systemProgram: SystemProgram.programId, tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
}

/** Claim winnings for a settled prop. */
export async function claim(program: Program, propPk: PublicKey, prop: any) {
  const user = program.provider.publicKey!;
  const { vault, position } = pdas(program, propPk, user);
  const userAta = getAssociatedTokenAddressSync(prop.stakeMint, user);
  return program.methods
    .claim()
    .accounts({ prop: propPk, vault, position, userTokenAccount: userAta, user, tokenProgram: TOKEN_PROGRAM_ID })
    .rpc();
}

export async function fetchProp(program: Program, propPk: PublicKey): Promise<any | null> {
  try {
    return await (program.account as any).prop.fetch(propPk);
  } catch {
    return null;
  }
}

export { ASSOCIATED_TOKEN_PROGRAM_ID };
