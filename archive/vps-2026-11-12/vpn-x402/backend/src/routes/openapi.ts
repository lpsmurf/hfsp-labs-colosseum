// GET /openapi.json — AgentCash-compliant discovery spec.
// Required by @agentcash/discovery, x402scan, Agentic Market, and the pay CLI.
// x-payment-info on each operation tells agents the exact price and protocol.
import { Router } from "express";
import env from "../config.js";

const router = Router();

const REGIONS = ["DE_NBG", "FI_HEL", "US_HIL", "SG_SIN"].join("|");
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const NETWORK   = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

// x402 protocol entry for Solana — custom Helius-verified flow.
// Header: X-Solana-Tx: <confirmed signature>  (not the EVM X-PAYMENT header)
function x402Sol() {
  return {
    x402: {
      network:  NETWORK,
      asset:    USDC_MINT,
      payTo:    env.OPERATOR_SOLANA_ADDRESS,
      header:   "X-Solana-Tx",
      note:     "Send confirmed Solana mainnet USDC transfer, then retry with X-Solana-Tx: <signature>",
    },
  };
}

function vpnOp(period: string, amount: string, durationLabel: string) {
  return {
    post: {
      operationId:  `vpn-${period}`,
      summary:      `Anonymous WireGuard VPN — ${durationLabel}`,
      tags:         ["VPN"],
      "x-payment-info": {
        price:     { mode: "fixed", currency: "USD", amount },
        protocols: [x402Sol()],
      },
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type:       "object",
              required:   ["clientWgPublicKey"],
              properties: {
                region: {
                  type:        "string",
                  enum:        REGIONS.split("|"),
                  default:     "DE_NBG",
                  description: "Datacenter region. Default: DE_NBG.",
                },
                clientWgPublicKey: {
                  type:        "string",
                  minLength:   40,
                  description: "Base64-encoded X25519 WireGuard public key. Generate client-side: `wg genkey | tee priv | wg pubkey`.",
                },
              },
            },
          },
        },
      },
      responses: {
        "200": {
          description: "VPN provisioned — WireGuard peer ready immediately.",
          content: {
            "application/json": {
              schema: {
                type:       "object",
                properties: {
                  ok:   { type: "boolean", example: true },
                  data: {
                    type:       "object",
                    properties: {
                      ip:             { type: "string", example: "1.2.3.4", description: "VPN server public IP. Use as `Endpoint` in WireGuard config." },
                      serverWgPubKey: { type: "string", description: "Server X25519 public key. Use as `PublicKey` in WireGuard [Peer] section." },
                    },
                  },
                  expiresAt: { type: "string", format: "date-time", description: "Server auto-destroyed at this UTC time." },
                },
              },
            },
          },
        },
        "402": {
          description: "Payment Required — x402 v2 challenge in PAYMENT-REQUIRED header and body.",
          content: {
            "application/json": {
              schema: {
                type:       "object",
                properties: {
                  x402Version: { type: "integer", example: 2 },
                  accepts:     { type: "array", items: { type: "object" } },
                  resource:    { type: "object" },
                },
              },
            },
          },
        },
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
      "x-payment-info": {
        price:     { mode: "fixed", currency: "USD", amount },
        protocols: [x402Sol()],
      },
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type:       "object",
              required:   ["sshPublicKey"],
              properties: {
                region: {
                  type:        "string",
                  enum:        REGIONS.split("|"),
                  default:     "DE_NBG",
                  description: "Datacenter region. Default: DE_NBG.",
                },
                sshPublicKey: {
                  type:        "string",
                  minLength:   70,
                  description: "OpenSSH Ed25519 public key (starts with `ssh-ed25519 AAAA`). Generate client-side: `ssh-keygen -t ed25519`. Private key never sent.",
                },
              },
            },
          },
        },
      },
      responses: {
        "200": {
          description: "VPS provisioned — SSH accessible in ~60 seconds.",
          content: {
            "application/json": {
              schema: {
                type:       "object",
                properties: {
                  ok:   { type: "boolean", example: true },
                  data: {
                    type:       "object",
                    properties: {
                      ip:                  { type: "string", example: "5.6.7.8", description: "Run: `ssh -i ~/.ssh/id_ed25519 root@<ip>`" },
                      wireguardClientConf: { type: "string", description: "Base64-encoded WireGuard client config for optional VPN tunnel to VPS." },
                    },
                  },
                  expiresAt: { type: "string", format: "date-time", description: "Server auto-destroyed at this UTC time." },
                },
              },
            },
          },
        },
        "402": {
          description: "Payment Required — x402 v2 challenge in PAYMENT-REQUIRED header and body.",
          content: {
            "application/json": {
              schema: {
                type:       "object",
                properties: {
                  x402Version: { type: "integer", example: 2 },
                  accepts:     { type: "array", items: { type: "object" } },
                  resource:    { type: "object" },
                },
              },
            },
          },
        },
      },
    },
  };
}

const spec = {
  openapi: "3.1.0",
  info: {
    title:       "HFSP VPN x402 (Solana)",
    version:     "2.0.0",
    description: "Anonymous WireGuard VPN passes and ephemeral Ubuntu VPS servers. Pay USDC on Solana. No account, no logs, no identity. Servers auto-destroy at expiry.",
    contact: { email: "info@hfsp.xyz", url: "https://hfsp.xyz" },
    "x-guidance": [
      "This API accepts USDC payments on Solana mainnet.",
      `Payment flow: 1) POST the endpoint → 402 with pay.amount, pay.mint, pay.payTo.`,
      `2) Send a Solana mainnet USDC transfer (${USDC_MINT}) to pay.payTo for at least pay.amount atomic units.`,
      "3) Wait for Helius confirmation, then retry the original POST with header X-Solana-Tx: <signature>.",
      "For VPN: generate an X25519 keypair client-side; send only the public key.",
      "For VPS: generate an Ed25519 SSH keypair client-side; send only the public key.",
      "Each transaction signature is single-use — replay attempts return 402.",
      "Prefer week/month passes over multiple hour passes to minimize transaction overhead.",
      `Use GET /api/vpn/regions or GET /api/vps/regions to list available geolocations before provisioning.`,
    ].join(" "),
  },
  "x-discovery": {
    ownershipProofs: [],
  },
  servers: [{ url: "https://vpn.hfsp.cloud" }],
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
