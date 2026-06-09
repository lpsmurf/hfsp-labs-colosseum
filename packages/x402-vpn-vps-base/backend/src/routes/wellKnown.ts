import { Router } from "express";
import env from "../config.js";

const router = Router();

const REGIONS = [
  { id: "DE_NBG", city: "Nuremberg, Germany",      continent: "EU"   },
  { id: "FI_HEL", city: "Helsinki, Finland",       continent: "EU"   },
  { id: "US_HIL", city: "Hillsboro, Oregon, USA",  continent: "US"   },
  { id: "SG_SIN", city: "Singapore",               continent: "APAC" },
];

// x402 discovery manifest — indexed by Agentic.Market, x402scan, and CDP AgentKit
const manifest = {
  name:        "HFSP VPN x402 (Base)",
  description: "Anonymous WireGuard VPN passes and ephemeral Ubuntu VPS servers. Pay USDC on Base. No account, no logs, no identity.",
  version:     "1.0.0",
  contact:     "info@hfsp.xyz",
  url:         "https://vpn-base.hfsp.cloud",
  network:     "base",
  networkId:   "eip155:8453",
  asset:       "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  recipient:   env.OPERATOR_BASE_ADDRESS,
  facilitator: "https://x402.org/facilitator",
  paymentHeader: "X-PAYMENT",
  regions:     REGIONS,
  services: [
    // ── VPN ──────────────────────────────────────────────────────────────────
    {
      id:          "vpn-hour",
      name:        "VPN — 1 hour",
      endpoint:    "/api/vpn/hour",
      method:      "POST",
      price:       "0.20",
      priceAtomic: 200000,
      currency:    "USDC",
      network:     "base",
      input:       { region: "DE_NBG|FI_HEL|US_HIL|SG_SIN", clientWgPublicKey: "string (base64 X25519, generated client-side)" },
      output:      { ip: "string", serverWgPubKey: "string (base64)", expiresAt: "ISO8601" },
      description: "Anonymous WireGuard VPN — 1-hour burner. Generate X25519 keypair client-side, send public key, get server IP + pubkey back.",
    },
    {
      id:          "vpn-day",
      name:        "VPN — 24 hours",
      endpoint:    "/api/vpn/day",
      method:      "POST",
      price:       "0.79",
      priceAtomic: 790000,
      currency:    "USDC",
      network:     "base",
      input:       { region: "string", clientWgPublicKey: "string" },
      output:      { ip: "string", serverWgPubKey: "string", expiresAt: "ISO8601" },
      description: "Anonymous WireGuard VPN — 24-hour pass.",
    },
    {
      id:          "vpn-week",
      name:        "VPN — 7 days",
      endpoint:    "/api/vpn/week",
      method:      "POST",
      price:       "2.99",
      priceAtomic: 2990000,
      currency:    "USDC",
      network:     "base",
      input:       { region: "string", clientWgPublicKey: "string" },
      output:      { ip: "string", serverWgPubKey: "string", expiresAt: "ISO8601" },
      description: "Anonymous WireGuard VPN — 7-day pass.",
    },
    {
      id:          "vpn-month",
      name:        "VPN — 30 days",
      endpoint:    "/api/vpn/month",
      method:      "POST",
      price:       "7.99",
      priceAtomic: 7990000,
      currency:    "USDC",
      network:     "base",
      input:       { region: "string", clientWgPublicKey: "string" },
      output:      { ip: "string", serverWgPubKey: "string", expiresAt: "ISO8601" },
      description: "Anonymous WireGuard VPN — 30-day pass.",
    },
    // ── VPS ──────────────────────────────────────────────────────────────────
    {
      id:          "vps-hour",
      name:        "VPS — 1 hour",
      endpoint:    "/api/vps/hour",
      method:      "POST",
      price:       "0.25",
      priceAtomic: 250000,
      currency:    "USDC",
      network:     "base",
      input:       { region: "string", sshPublicKey: "string (OpenSSH Ed25519, generated client-side)" },
      output:      { ip: "string", wireguardClientConf: "string (base64)", expiresAt: "ISO8601" },
      description: "Ephemeral Ubuntu VPS — 1-hour burner. SSH public key generated client-side; private key never leaves the client.",
    },
    {
      id:          "vps-day",
      name:        "VPS — 24 hours",
      endpoint:    "/api/vps/day",
      method:      "POST",
      price:       "0.99",
      priceAtomic: 990000,
      currency:    "USDC",
      network:     "base",
      input:       { region: "string", sshPublicKey: "string" },
      output:      { ip: "string", wireguardClientConf: "string", expiresAt: "ISO8601" },
      description: "Ephemeral Ubuntu VPS — 24-hour.",
    },
    {
      id:          "vps-week",
      name:        "VPS — 7 days",
      endpoint:    "/api/vps/week",
      method:      "POST",
      price:       "3.99",
      priceAtomic: 3990000,
      currency:    "USDC",
      network:     "base",
      input:       { region: "string", sshPublicKey: "string" },
      output:      { ip: "string", wireguardClientConf: "string", expiresAt: "ISO8601" },
      description: "Ephemeral Ubuntu VPS — 7-day.",
    },
  ],
};

const agentCard = {
  name:             manifest.name,
  description:      manifest.description,
  url:              manifest.url,
  version:          manifest.version,
  provider: {
    organization: "HFSP",
    url:          "https://hfsp.xyz",
    contact:      manifest.contact,
  },
  documentationUrl: `${manifest.url}/.well-known/x402.json`,
  capabilities: {
    streaming:         false,
    pushNotifications: false,
  },
  skills: manifest.services.map(s => ({
    id:          s.id,
    name:        s.name,
    description: s.description,
    inputModes:  ["application/json"],
    outputModes: ["application/json"],
    examples: [
      `POST ${s.endpoint} with ${JSON.stringify(Object.keys(s.input))} — pay ${s.price} USDC on Base`,
    ],
  })),
};

router.get("/x402.json",       (_req, res) => { res.json(manifest); });
router.get("/agent-card.json", (_req, res) => { res.json(agentCard); });

export default router;
