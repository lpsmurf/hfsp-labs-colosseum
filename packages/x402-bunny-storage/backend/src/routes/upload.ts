// x402-gated file upload to Bunny.net Storage.
//
// Flow:
//   Phase 1 (no X-Solana-Tx):
//     1. Price the request from the uploaded body size
//     2. Return 402 with our price
//
//   Phase 2 (same request, with X-Solana-Tx header):
//     1. Replay protection (Redis SET NX)
//     2. Verify Helius tx: agent paid us >= price for this exact body size
//     3. PUT the bytes to Bunny.net Storage under a random prefix
//     4. Return the public CDN URL
//
// The client resends the identical PUT (path + body) for both phases, matching
// the x402 "identical request, price computed from request content" contract.
import { Router, raw } from "express";
import crypto from "node:crypto";
import env from "../config.js";
import { sanitizeStoragePath, uploadToBunny } from "../services/bunny.js";
import { verifyHeliusTx } from "../services/heliusVerify.js";
import { claimTxSig, releaseTxSig } from "../services/redis.js";
import { TxAlreadyUsed } from "../errors.js";

const router = Router();

router.use(raw({ type: "*/*", limit: `${env.MAX_UPLOAD_MB}mb` }));

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const OPERATOR  = env.OPERATOR_SOLANA_ADDRESS;
const NETWORK   = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

function priceForBytes(sizeBytes: number): bigint {
  const mb  = sizeBytes / (1024 * 1024);
  const usd = Math.max(env.MIN_PRICE_USDC, env.PRICE_PER_MB_USDC * mb);
  return BigInt(Math.ceil(usd * 1_000_000));
}

function make402(amount: bigint, url: string, sizeBytes: number) {
  const paymentRequired = {
    x402Version: 2,
    resource:    { url, description: `Upload ${sizeBytes} bytes to Bunny.net Storage via HFSP`, mimeType: "application/octet-stream" },
    accepts: [{
      scheme:            "exact",
      network:           NETWORK,
      amount:            amount.toString(),
      asset:             USDC_MINT,
      payTo:             OPERATOR,
      maxTimeoutSeconds: 300,
      extra:             {},
    }],
  };
  const encoded = Buffer.from(JSON.stringify(paymentRequired), "utf8").toString("base64");
  return {
    headers: { "PAYMENT-REQUIRED": encoded },
    body: {
      ...paymentRequired,
      ok:    false,
      error: "Payment Required",
      pay: {
        amount:       Number(amount),
        amountUsd:    (Number(amount) / 1_000_000).toFixed(6),
        mint:         USDC_MINT,
        payTo:        OPERATOR,
        network:      NETWORK,
        sizeBytes,
        instructions: "Send Solana mainnet USDC to payTo, then retry the identical PUT with X-Solana-Tx: <signature>.",
      },
    },
  };
}

// PUT /api/upload/*path — path becomes the object's storage path (namespaced under a random prefix)
router.put(/^\/(.*)$/, async (req, res) => {
  const txSig   = req.headers["x-solana-tx"] as string | undefined;
  const rawPath = req.params[0] ?? "";
  const body    = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const url     = `${env.PUBLIC_BASE_URL}/api/upload/${rawPath}`;

  let storagePath: string;
  try {
    storagePath = sanitizeStoragePath(rawPath);
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e.message });
    return;
  }

  const amount = priceForBytes(body.length);

  // ── Phase 1: no payment header → return 402 ──────────────────────────────
  if (!txSig) {
    const { headers, body: resBody } = make402(amount, url, body.length);
    res.set(headers).status(402).json(resBody);
    return;
  }

  // ── Phase 2: payment header present → verify, then upload ────────────────
  if (body.length === 0) {
    res.status(400).json({ ok: false, error: "Empty upload body" });
    return;
  }

  const claimed = await claimTxSig(txSig);
  if (!claimed) {
    const err = new TxAlreadyUsed(txSig);
    res.status(err.httpStatus).json(err.toResponse());
    return;
  }

  const verification = await verifyHeliusTx(txSig, USDC_MINT, OPERATOR, amount);
  if (!verification.ok) {
    await releaseTxSig(txSig);
    res.status(402).json({
      ok:    false,
      error: verification.error,
      hint:  `Required: $${(Number(amount) / 1_000_000).toFixed(4)} USDC for ${body.length} bytes`,
      txSig,
    });
    return;
  }

  try {
    const uniquePrefix = crypto.randomUUID().slice(0, 8);
    const finalPath = `${uniquePrefix}/${storagePath}`;
    const result = await uploadToBunny(finalPath, body);
    res.status(201).json({
      ok:   true,
      data: { url: result.cdnUrl, path: result.storagePath, sizeBytes: result.sizeBytes },
    });
  } catch (e: any) {
    // Payment verified but Bunny upload failed. DO NOT release txSig (payment already consumed).
    console.error("[bunny-storage] upload failed after payment verified", {
      txSig: txSig.slice(0, 16),
      error: e.message,
    });
    res.status(502).json({
      ok:    false,
      error: "Upload failed after payment. Contact info@hfsp.xyz with your transaction signature for a refund.",
      txSig,
      code:  "UPLOAD_FAILED",
    });
  }
});

export default router;
