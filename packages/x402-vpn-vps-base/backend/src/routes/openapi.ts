// GET /openapi.json — AgentCash-compliant discovery spec.
// Lists both x402 (Base mainnet, x402.org facilitator) and MPP (Tempo chain).
// x-payment-info on each operation tells agents the exact price and protocol.
import { Router } from "express";
import env from "../config.js";

const router = Router();

const REGIONS    = ["DE_NBG", "FI_HEL", "US_HIL", "SG_SIN"].join("|");
const BASE_USDC  = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const TEMPO_USDC = "0x20c000000000000000000000b9537d11c60e8b50";
const BASE_URL   = env.BASE_URL ?? "https://vpn-base.hfsp.cloud";

function paymentInfo(amount: string) {
  return {
    price:     { mode: "fixed", currency: "USD", amount },
    protocols: [
      { x402: {} },
      {
        mpp: {
          method:   "evm",
          intent:   "charge",
          currency: TEMPO_USDC,
        },
      },
    ],
  };
}

function vpnOp(period: string, amount: string, durationLabel: string) {
  return {
    post: {
      operationId:  `vpn-${period}`,
      summary:      `Anonymous WireGuard VPN — ${durationLabel}`,
      tags:         ["VPN"],
      "x-payment-info": paymentInfo(amount),
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type:       "object",
              required:   ["clientWgPublicKey"],
              properties: {
                region:            { type: "string", enum: REGIONS.split("|"), default: "DE_NBG", description: "Datacenter region" },
                clientWgPublicKey: { type: "string", description: "Base64-encoded X25519 WireGuard public key, generated client-side." },
              },
            },
          },
        },
      },
      responses: {
        "200": {
          description: "VPN provisioned",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok:   { type: "boolean" },
                  data: {
                    type: "object",
                    properties: {
                      ip:             { type: "string", example: "1.2.3.4" },
                      serverWgPubKey: { type: "string", description: "Server X25519 public key for WireGuard [Peer] section." },
                    },
                  },
                  expiresAt: { type: "string", format: "date-time" },
                },
              },
            },
          },
        },
        "402": { description: "Payment Required" },
      },
    },
  };
}

function vpsOp(period: string, amount: string, durationLabel: string) {
  return {
    post: {
      operationId:  `vps-${period}`,
      summary:      `Ephemeral Ubuntu VPS — ${durationLabel}`,
      tags:         ["VPS"],
      "x-payment-info": paymentInfo(amount),
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type:       "object",
              required:   ["sshPublicKey"],
              properties: {
                region:       { type: "string", enum: REGIONS.split("|"), default: "DE_NBG", description: "Datacenter region" },
                sshPublicKey: { type: "string", description: "OpenSSH Ed25519 public key. Generate client-side — private key never sent." },
              },
            },
          },
        },
      },
      responses: {
        "200": {
          description: "VPS provisioned — SSH ready in ~60s",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  ok:   { type: "boolean" },
                  data: {
                    type: "object",
                    properties: {
                      ip:                  { type: "string", example: "5.6.7.8", description: "ssh -i key.pem root@<ip>" },
                      wireguardClientConf: { type: "string", description: "Base64 WireGuard client config template." },
                    },
                  },
                  expiresAt: { type: "string", format: "date-time", description: "Server destroyed at this time." },
                },
              },
            },
          },
        },
        "402": { description: "Payment Required" },
      },
    },
  };
}

const spec = {
  openapi: "3.1.0",
  info: {
    title:       "HFSP VPN x402 (Base)",
    version:     "1.0.0",
    description: "Anonymous WireGuard VPN passes and ephemeral Ubuntu VPS servers. Pay USDC on Base or Tempo (MPP). No account, no logs, no identity. Servers auto-destroy at expiry.",
    contact: { email: "info@hfsp.xyz", url: "https://hfsp.xyz" },
    "x-guidance": [
      "This API accepts USDC via x402 (Base mainnet) and MPP (Tempo chain).",
      `x402 flow: POST endpoint → 402 → pay ${BASE_USDC} USDC to ${env.OPERATOR_BASE_ADDRESS} on eip155:8453 → retry with X-PAYMENT header.`,
      "MPP flow: POST endpoint → 402 with WWW-Authenticate: mpp → pay Tempo USDC → retry with Authorization: mpp header.",
      "For VPN: generate an X25519 keypair client-side; send only the public key.",
      "For VPS: generate an Ed25519 SSH keypair client-side; send only the public key.",
      "Prefer week/month passes over multiple hour passes to minimize transaction overhead.",
      "Use GET /api/vpn/regions or GET /api/vps/regions to list available geolocations.",
    ].join(" "),
  },
  "x-discovery": {
    ownershipProofs: [],
  },
  servers: [{ url: BASE_URL }],
  tags: [
    { name: "VPN", description: "Anonymous WireGuard VPN passes" },
    { name: "VPS", description: "Ephemeral Ubuntu VPS servers" },
  ],
  paths: {
    "/api/vpn/hour":  vpnOp("hour",  "0.200000", "1 hour"),
    "/api/vpn/day":   vpnOp("day",   "0.790000", "24 hours"),
    "/api/vpn/week":  vpnOp("week",  "2.990000", "7 days"),
    "/api/vpn/month": vpnOp("month", "7.990000", "30 days"),
    "/api/vps/hour":  vpsOp("hour",  "0.250000", "1 hour"),
    "/api/vps/day":   vpsOp("day",   "0.990000", "24 hours"),
    "/api/vps/week":  vpsOp("week",  "3.990000", "7 days"),
  },
};

router.get("/", (_req, res) => { res.json(spec); });

export default router;
