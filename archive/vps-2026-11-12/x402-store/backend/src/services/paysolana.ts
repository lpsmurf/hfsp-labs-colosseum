// Pays Cryptorefills via the Solana x402 flow using our server's keypair.
// Called AFTER we have verified that an agent has paid us.
//
// Protocol (per cryptorefills-x402 SKILL.md):
//   - 3 instructions: ComputeBudget limit + price + TransferChecked (NOT Transfer)
//   - payerKey = extra.feePayer (CDP pays SOL gas — we don't need SOL)
//   - payTo is the OWNER pubkey; derive recipient ATA from (payTo, mint)
//   - Partial-sign with our server keypair; feePayer slot left for CDP
//   - PAYMENT-SIGNATURE outer wrapper is base64url; inner tx is plain base64
//
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { createTransferCheckedInstruction, getAssociatedTokenAddress } from "@solana/spl-token";
import bs58 from "bs58";
import env from "../config.js";
import type { CrPaymentRequired } from "./cryptorefills.js";
import { crPhase2 } from "./cryptorefills.js";
import type { CrOrderBody } from "./cryptorefills.js";

const SOLANA_RPC = new Connection(env.SOLANA_RPC_URL ?? env.HELIUS_RPC_URL, "confirmed");

// Lazy-load the keypair once
let _keypair: Keypair | null = null;
function getKeypair(): Keypair {
  if (!_keypair) {
    try {
      _keypair = Keypair.fromSecretKey(bs58.decode(env.STORE_SOLANA_PRIVATE_KEY));
    } catch (err: any) {
      throw new Error(`Invalid STORE_SOLANA_PRIVATE_KEY: ${err?.message ?? err}`);
    }
  }
  return _keypair;
}

export async function payAndFulfill(
  orderBody: CrOrderBody,
  sessionId: string,
  crPR: CrPaymentRequired,
): Promise<unknown> {
  const accept = crPR.accepts[0];
  const rawAmount = accept.amount ?? accept.maxAmountRequired;
  if (!rawAmount) throw new Error("paysolana: no amount in CR payment required");

  const crAmount   = BigInt(rawAmount);
  const signer     = getKeypair();
  const mint       = new PublicKey(accept.asset);
  const owner      = new PublicKey(accept.payTo);
  const feePayer   = new PublicKey(accept.extra?.feePayer ?? accept.extra?.fee_payer);

  const senderAta    = await getAssociatedTokenAddress(mint, signer.publicKey);
  const recipientAta = await getAssociatedTokenAddress(mint, owner);

  // Must fetch immediately before signing — Solana blockhash valid ~60s
  const { blockhash } = await SOLANA_RPC.getLatestBlockhash("finalized");

  const message = new TransactionMessage({
    payerKey:        feePayer,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }),
      createTransferCheckedInstruction(
        senderAta,
        mint,
        recipientAta,
        signer.publicKey,
        crAmount,
        6,
      ),
    ],
  }).compileToV0Message();

  const tx = new VersionedTransaction(message);
  tx.sign([signer]);

  if (tx.message.compiledInstructions.length !== 3) {
    throw new Error("paysolana: expected exactly 3 instructions");
  }
  if (tx.serialize().length > 1232) {
    throw new Error("paysolana: transaction exceeds 1232-byte limit");
  }

  const txB64 = Buffer.from(tx.serialize()).toString("base64");
  const inner = {
    x402Version: 2,
    scheme:      "exact",
    network:     accept.network,
    payload:     { transaction: txB64 },
  };
  const paymentSig = Buffer.from(JSON.stringify(inner)).toString("base64url");

  return crPhase2(orderBody, sessionId, paymentSig);
}
