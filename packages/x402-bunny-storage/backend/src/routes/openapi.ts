// GET /openapi.json — AgentCash / pay.sh / x402scan discovery spec
import { Router } from "express";
import env from "../config.js";

const router = Router();

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const NETWORK   = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const BASE_URL  = env.PUBLIC_BASE_URL;

function x402Sol() {
  return {
    x402: {
      network: NETWORK,
      asset:   USDC_MINT,
      header:  "X-Solana-Tx",
      note:    "Send confirmed Solana mainnet USDC to the payTo address in the 402 response body, then retry the identical PUT with X-Solana-Tx: <signature>.",
    },
  };
}

const response402 = {
  description: "Payment Required — x402 v2 challenge. PAYMENT-REQUIRED header contains base64(JSON). Pay USDC on Solana, retry with X-Solana-Tx.",
  content: {
    "application/json": {
      schema: {
        type:       "object",
        properties: {
          x402Version: { type: "integer", example: 2 },
          accepts:     { type: "array", items: { type: "object" } },
          resource:    { type: "object" },
          pay: {
            type:       "object",
            properties: {
              amount:       { type: "integer", description: "Atomic USDC units (6 decimals)" },
              amountUsd:    { type: "string",  description: "Human-readable USD amount" },
              sizeBytes:    { type: "integer", description: "Priced upload size in bytes" },
              payTo:        { type: "string",  description: "Solana wallet to send USDC to" },
              instructions: { type: "string" },
            },
          },
        },
      },
    },
  },
};

const spec = {
  openapi: "3.1.0",
  info: {
    title:       "HFSP Bunny Storage x402 (Solana)",
    version:     "1.0.0",
    description: [
      "Pay-per-upload object storage for AI agents, backed by Bunny.net Storage + CDN.",
      "Pay USDC on Solana mainnet via x402 v2. No account, no API key.",
      `Pricing: $${env.PRICE_PER_MB_USDC}/MB, minimum $${env.MIN_PRICE_USDC} per upload, max ${env.MAX_UPLOAD_MB}MB.`,
      "Flow: 1) PUT /api/upload/{path} with the file bytes as the body → 402 with pay.amount and pay.payTo.",
      `2) Send Solana mainnet USDC to pay.payTo (mint: ${USDC_MINT}).`,
      "3) Wait for confirmation, resend the identical PUT (same path + body) with X-Solana-Tx: <signature>.",
      "4) Receive the public CDN URL in the 201 response.",
    ].join(" "),
    contact: { email: "info@hfsp.xyz", url: "https://hfsp.xyz" },
  },
  servers: [{ url: BASE_URL }],
  security: [{ x402: [] }],
  components: {
    securitySchemes: {
      x402: {
        type:        "apiKey",
        in:          "header",
        name:        "X-Solana-Tx",
        description: "x402 v2 payment. Send confirmed Solana mainnet USDC to the address in the 402 response, then retry with X-Solana-Tx: <signature>.",
      },
    },
  },
  tags: [
    { name: "Upload", description: "Upload objects to Bunny.net Storage (x402 payment required)" },
  ],
  paths: {
    "/api/upload/{path}": {
      put: {
        operationId: "upload-object",
        summary:     "Upload a file to Bunny.net Storage",
        tags:        ["Upload"],
        "x-payment-info": {
          price:     { mode: "dynamic", currency: "USD", note: `Priced by body size: $${env.PRICE_PER_MB_USDC}/MB, min $${env.MIN_PRICE_USDC}. Check pay.amountUsd in the 402 response.` },
          protocols: [x402Sol()],
        },
        parameters: [{
          name: "path", in: "path", required: true, schema: { type: "string" },
          description: "Destination path/filename for the object, e.g. reports/q3.pdf. Stored under a server-generated random prefix to avoid collisions.",
        }],
        requestBody: {
          required: true,
          content:  { "application/octet-stream": { schema: { type: "string", format: "binary" } } },
        },
        responses: {
          "201": {
            description: "Upload succeeded",
            content: { "application/json": { schema: {
              type:       "object",
              properties: {
                ok:   { type: "boolean", example: true },
                data: {
                  type:       "object",
                  properties: {
                    url:       { type: "string", description: "Public CDN URL for the uploaded object" },
                    path:      { type: "string", description: "Storage path (server-prefixed)" },
                    sizeBytes: { type: "integer" },
                  },
                },
              },
            } } },
          },
          "402": response402,
          "502": { description: "Upload failed after payment was verified — contact support with the txSig for a refund" },
        },
      },
    },
  },
};

router.get("/", (_req, res) => { res.json(spec); });

export default router;
