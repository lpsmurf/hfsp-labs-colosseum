import { Router } from "express";
import env from "../config.js";
import { celoEnabled } from "../celoConfig.js";

const router = Router();

const BASE_URL = env.PUBLIC_BASE_URL;

// x402 discovery manifest. Each resource is a paid endpoint an agent can pay
// per call; the 402 it returns carries the network, asset and payTo. The Celo
// rail is listed only when it is actually configured, so discovery never points
// agents at an endpoint that cannot settle.
function manifest() {
  const resources: Array<Record<string, unknown>> = [
    { url: `${BASE_URL}/api/orders`, network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", asset: "USDC" },
  ];
  if (celoEnabled) {
    resources.push({
      url: `${BASE_URL}/api/celo/orders`,
      network: "eip155:42220",
      assets: ["USDT", "USAT", "USDC"],
      accepts: "?asset=USDT|USAT|USDC",
      description: "Mobile airtime, data, gift cards and eSIMs, paid in stablecoins on Celo over x402. Answers 202 with an order id; poll GET /api/celo/orders/:id.",
    });
  }
  return { version: 1, resources };
}

// x402scan / discovery fan-out endpoint.
router.get("/x402", (_req, res) => { res.json(manifest()); });

export default router;
