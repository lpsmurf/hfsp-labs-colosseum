import { Request, Response, NextFunction } from "express";
import { isApproved } from "../kyc-store.js";

// Reads wallet from req.query.wallet, req.body.wallet, or the X-Wallet header.
// Returns 403 if the wallet has not been KYC-approved.
export function requireKyc(req: Request, res: Response, next: NextFunction): void {
  const wallet =
    (req.query.wallet as string) ??
    req.body?.wallet ??
    req.headers["x-wallet"];

  if (!wallet || typeof wallet !== "string") {
    res.status(400).json({ error: "wallet address required" });
    return;
  }

  if (!isApproved(wallet)) {
    res.status(403).json({
      error: "KYC verification required",
      kycUrl: "/api/kyc/token",
    });
    return;
  }

  next();
}
