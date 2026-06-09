import { Router } from "express";
import env from "../config.js";

const router = Router();

const BASE_URL = env.PUBLIC_BASE_URL;

const x402Manifest = {
  version:   1,
  resources: [
    `${BASE_URL}/api/orders`,
  ],
};

// x402scan discovery fan-out endpoint
router.get("/x402", (_req, res) => { res.json(x402Manifest); });

export default router;
