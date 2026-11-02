import {
  PublicKey,
  SystemProgram,
  type Signer,
} from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import type { Txoracle } from "./idl/txoracle";
import { txlineMint, type Network } from "./config";
import { deriveTreasuryPdas } from "./pdas";

/**
 * On-chain subscription to a Txoracle service level via the `subscribe`
 * instruction. For the free World Cup tiers no TxLINE tokens are charged, but
 * the transaction still registers on-chain and its signature is required to
 * activate an API token (see auth.ts).
 *
 * Service levels (devnet, free World Cup 2026):
 *   - 1  → 60-second delayed feed (the free devnet tier)
 * On mainnet, level 12 additionally offers the real-time free World Cup feed.
 *
 * NOTE on `weeks`: subscriptions must be a multiple of 4 (min 4) per TxLINE's
 * subscription-tiers docs — the on-chain program rejects other durations. We
 * default to 4. (The sponsor's older backup examples pass `1`, which the live
 * program no longer accepts.)
 */
export interface SubscribeOptions {
  serviceLevelId?: number;
  weeks?: number;
  /** Network whose TxLINE mint to use (default devnet). Ignored if `txlMint` set. */
  network?: Network;
  /** Explicit TxLINE mint override (takes precedence over `network`). */
  txlMint?: PublicKey;
  /**
   * Payer/authority for the ATA-creation + subscribe transaction. Defaults to
   * the provider wallet's underlying keypair (NodeWallet.payer). Supply
   * explicitly when the provider wallet doesn't expose a `payer`.
   */
  payer?: Signer;
}

export interface SubscribeResult {
  /** Confirmed transaction signature — feed this into activation. */
  txSig: string;
  /** The user's TxLINE associated token account. */
  userTokenAccount: PublicKey;
}

function providerPayer(program: Program<Txoracle>): Signer {
  const provider = program.provider as AnchorProvider;
  const payer = (provider.wallet as any).payer as Signer | undefined;
  if (!payer) {
    throw new Error(
      "subscribe: provider wallet has no `payer`; pass opts.payer explicitly"
    );
  }
  return payer;
}

/**
 * Subscribe to a service level on-chain. Returns the tx signature (for
 * activation) and the user's TxLINE token account.
 */
export async function subscribe(
  program: Program<Txoracle>,
  opts: SubscribeOptions = {}
): Promise<SubscribeResult> {
  const {
    serviceLevelId = 1,
    weeks = 4,
    network = "devnet",
    payer = providerPayer(program),
  } = opts;

  const provider = program.provider as AnchorProvider;
  const mint = opts.txlMint ?? txlineMint(network);

  // Ensure the user has a TxLINE token account (Token-2022).
  const userTokenAccount = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    payer,
    mint,
    provider.publicKey!,
    false,
    "confirmed",
    undefined,
    TOKEN_2022_PROGRAM_ID
  );

  const { pricingMatrixPda, tokenTreasuryPda, tokenTreasuryVault } =
    deriveTreasuryPdas(program.programId, mint);

  const txSig = await program.methods
    .subscribe(serviceLevelId, weeks)
    .accounts({
      user: provider.publicKey!,
      pricingMatrix: pricingMatrixPda,
      tokenMint: mint,
      userTokenAccount: userTokenAccount.address,
      tokenTreasuryVault,
      tokenTreasuryPda,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return { txSig, userTokenAccount: userTokenAccount.address };
}

/**
 * Subscribe to the free World Cup tier (service level 1). Thin alias over
 * `subscribe` with the free-tier defaults, kept for call-site clarity in the
 * downstream repos.
 */
export function subscribeFreeWorldCup(
  program: Program<Txoracle>,
  opts: Omit<SubscribeOptions, "serviceLevelId"> = {}
): Promise<SubscribeResult> {
  return subscribe(program, { ...opts, serviceLevelId: 1 });
}
