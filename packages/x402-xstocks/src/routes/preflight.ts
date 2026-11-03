// Pre-flight check before an RFQ — verifies the wallet has the required ATAs.
// ATAs must exist on Solana before the transaction will succeed.
import { Router, Request, Response } from "express";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { config } from "../config.js";

export const preflightRouter = Router();

const connection = new Connection(config.solanaRpc, {
  commitment: "confirmed",
  confirmTransactionInitialTimeout: 15_000,
});

// GET /api/xchange/preflight?wallet=<base58>&mint=<base58>
// Returns { hasAta: bool, ataAddress: string, balance: string }
// If hasAta is false, the frontend must create the ATA before submitting the swap tx.
preflightRouter.get("/", async (req: Request, res: Response) => {
  const { wallet, mint } = req.query as Record<string, string>;

  if (!wallet || !mint) {
    res.status(400).json({ error: "wallet and mint query params required" });
    return;
  }

  let walletPk: PublicKey, mintPk: PublicKey;
  try {
    walletPk = new PublicKey(wallet);
    mintPk   = new PublicKey(mint);
  } catch {
    res.status(400).json({ error: "invalid wallet or mint address" });
    return;
  }

  // Try both token programs — xStocks uses Token-2022 (Token Extensions)
  for (const programId of [TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID]) {
    try {
      const ata = getAssociatedTokenAddressSync(mintPk, walletPk, false, programId);
      const info = await connection.getAccountInfo(ata);
      if (info !== null) {
        const tokenAcct = await connection.getTokenAccountBalance(ata).catch(() => null);
        res.json({
          hasAta:     true,
          ataAddress: ata.toBase58(),
          programId:  programId.toBase58(),
          balance:    tokenAcct?.value.uiAmountString ?? "0",
        });
        return;
      }
    } catch (err) {
      console.error(`[preflight] lookup failed for program ${programId.toBase58()}:`, err instanceof Error ? err.message : err);
      continue;
    }
  }

  // No ATA found under either program — return the Token-2022 address to create
  const ata = getAssociatedTokenAddressSync(mintPk, walletPk, false, TOKEN_2022_PROGRAM_ID);
  res.json({
    hasAta:     false,
    ataAddress: ata.toBase58(),
    programId:  TOKEN_2022_PROGRAM_ID.toBase58(),
    balance:    "0",
  });
});
