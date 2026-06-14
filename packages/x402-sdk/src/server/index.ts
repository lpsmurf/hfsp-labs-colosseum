import type { Request, Response, NextFunction } from "express";
import type { PaymentConfig, X402Challenge, BazaarConfig, BazaarExtension } from "../types.js";
import { USDC_MAINNET, SOLANA_MAINNET } from "../types.js";
import { TxAlreadyUsed } from "../errors.js";
import { verifyTx } from "./verify.js";
import { MemoryReplayStore } from "./replay.js";

function buildBazaarExtension(c: BazaarConfig): BazaarExtension {
  const method = c.method ?? "GET";
  const isBody = ["POST", "PUT", "PATCH"].includes(method);

  const inputInfo: BazaarExtension["info"]["input"] = { type: "http", method };
  if (!isBody && c.queryParams) inputInfo.queryParams = c.queryParams;
  if (c.pathParams)             inputInfo.pathParams  = c.pathParams;

  const inputSchemaProps: Record<string, object> = {
    type:   { type: "string", const: "http" },
    method: { type: "string", enum: isBody ? ["POST","PUT","PATCH"] : ["GET","HEAD","DELETE"] },
  };
  if (!isBody && c.queryParamsSchema)
    inputSchemaProps["queryParams"] = { type: "object", ...c.queryParamsSchema };
  if (c.pathParamsSchema)
    inputSchemaProps["pathParams"] = { type: "object", ...c.pathParamsSchema };

  const schemaProps: Record<string, object> = {
    input: { type: "object", properties: inputSchemaProps, required: ["type","method"], additionalProperties: false },
  };

  const hasExample = c.output?.example !== undefined;
  if (hasExample) {
    schemaProps["output"] = {
      type: "object",
      properties: {
        type:    { type: "string" },
        // The user-provided schema is the complete definition for `example`;
        // default to a generic object schema when none was supplied.
        example: c.output!.schema ?? { type: "object" },
      },
      required: ["type"],
    };
  }

  return {
    info: {
      input: inputInfo,
      ...(hasExample ? { output: { type: "json", example: c.output!.example } } : {}),
    },
    schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: schemaProps,
      required: ["input"],
    },
  };
}

export { MemoryReplayStore, RedisReplayStore } from "./replay.js";
export { verifyTx } from "./verify.js";

/**
 * Express middleware that requires a confirmed Solana USDC payment before the handler runs.
 *
 * @example
 * ```ts
 * import { x402 } from '@hfsp/x402-sdk/server';
 *
 * app.post('/api/analyze', x402({
 *   amount:  500_000n,          // $0.50 USDC
 *   payTo:   'YOUR_WALLET',
 *   rpcUrl:  process.env.HELIUS_RPC_URL,
 * }), (req, res) => {
 *   res.json({ result: req.solanaPayment });
 * });
 * ```
 *
 * Client flow:
 *   1. Call endpoint without header → 402 JSON with payment instructions
 *   2. Send USDC on Solana mainnet to `payTo`
 *   3. Retry with `X-Solana-Tx: <confirmed-sig>` header → 200
 *
 * @remarks
 * The 402 challenge's `resource.url` is built from `req.protocol` and the
 * `Host` header. Behind a TLS-terminating reverse proxy (nginx, etc.) the app
 * MUST enable Express trust-proxy — `app.set('trust proxy', true)` — so that
 * `req.protocol` reflects `X-Forwarded-Proto` (`https`) rather than the
 * internal `http` hop. Without it the advertised resource URL will be wrong.
 */
export function x402(config: PaymentConfig) {
  const mint    = config.mint    ?? USDC_MAINNET;
  const network = config.network ?? SOLANA_MAINNET;
  const desc    = config.description ?? "Access to this resource";
  const replay  = config.replayStore ?? new MemoryReplayStore();

  return async (req: Request, res: Response, next: NextFunction) => {
    const txSig = req.headers["x-solana-tx"] as string | undefined;

    if (!txSig) {
      const url = `${req.protocol}://${req.get("host")}${req.originalUrl.split("?")[0]}`;
      const challenge: X402Challenge = {
        x402Version: 2,
        resource:    { url, description: desc, mimeType: "application/json" },
        accepts: [{
          scheme:            "exact",
          network,
          amount:            config.amount.toString(),
          asset:             mint,
          payTo:             config.payTo,
          maxTimeoutSeconds: 300,
          extra:             {},
        }],
        ...(config.bazaar ? { extensions: { bazaar: buildBazaarExtension(config.bazaar) } } : {}),
      };
      const encoded = Buffer.from(JSON.stringify(challenge), "utf8").toString("base64");

      return res
        .set("PAYMENT-REQUIRED", encoded)
        .status(402)
        .json({
          ...challenge,
          ok:    false,
          error: "Payment Required",
          pay: {
            amount:    Number(config.amount),
            amountUsd: (Number(config.amount) / 1_000_000).toFixed(6),
            mint,
            payTo:     config.payTo,
            network,
            description: desc,
          },
          instructions: "Send Solana USDC to `pay.payTo`, then retry with X-Solana-Tx: <signature>",
        });
    }

    let claimed = false;
    try {
      // Replay protection — atomic claim before any RPC call
      claimed = await replay.claim(txSig);
      if (!claimed) {
        const err = new TxAlreadyUsed(txSig);
        return res.status(err.httpStatus).json(err.toBody());
      }

      const result = await verifyTx(config.rpcUrl, txSig, mint, config.payTo, config.amount);

      if (!result.ok) {
        // Release so the caller can retry with a valid tx
        await replay.release(txSig);
        return res.status(402).json({ ok: false, error: result.error, txSig });
      }

      (req as any).solanaPayment = {
        txSig,
        amount:        result.amount,
        from:          result.from ?? "",
        agentDiscount: false,
      };

      next();
    } catch (err) {
      // Replay store / RPC threw (e.g. Redis down). Release any claim so the
      // caller can retry once the dependency recovers, and respond cleanly
      // instead of crashing the request.
      if (claimed) {
        try { await replay.release(txSig); } catch { /* best-effort */ }
      }
      return res.status(502).json({
        ok: false,
        error: "payment verification failed (upstream error)",
      });
    }
  };
}
