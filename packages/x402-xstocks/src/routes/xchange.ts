// xChange KYC-gated proxy — Backed API v2.
// Soft quote, hard RFQ, status poll.
// Transaction signing + Solana submission happens client-side.
import { Router, Request, Response } from "express";
import { config } from "../config.js";
import { MOCK_ASSETS, mockSoftQuote, mockRfq, mockQuoteStatus } from "../mock-xchange.js";

const MOCK_MODE = !config.backedApiKey && config.nodeEnv !== "production";
if (MOCK_MODE) console.warn("[xchange] MOCK MODE — set BACKED_API_KEY for live Backed API");

export const xchangeRouter = Router();

const BACKED_BASE = "https://api.backed.fi/api/v2";

function backedHeaders(): Record<string, string> {
  if (!config.backedApiKey && config.nodeEnv === "production") {
    throw new Error("BACKED_API_KEY is not set — refusing to call the Backed API without authentication in production");
  }
  return {
    "X-API-KEY":     config.backedApiKey,
    "Content-Type":  "application/json",
    "Accept":        "application/json",
  };
}

const UPSTREAM_TIMEOUT_MS = 30_000;

async function backedGet(path: string, res: Response): Promise<void> {
  try {
    const r = await fetch(`${BACKED_BASE}${path}`, {
      headers: backedHeaders(),
      signal:  AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const body = await r.json();
    res.status(r.status).json(body);
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    console.error(`[xchange] GET ${path}`, err);
    res.status(timedOut ? 504 : 502).json({ error: timedOut ? "upstream timeout" : "upstream error" });
  }
}

async function backedPost(path: string, body: unknown, res: Response): Promise<void> {
  try {
    const r = await fetch(`${BACKED_BASE}${path}`, {
      method:  "POST",
      headers: backedHeaders(),
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    console.error(`[xchange] POST ${path}`, err);
    res.status(timedOut ? 504 : 502).json({ error: timedOut ? "upstream timeout" : "upstream error" });
  }
}

// ── Asset discovery ──────────────────────────────────────────────────────────

// GET /api/xchange/assets?page=1&pageSize=20
// Lists all tradeable xStocks with order size limits, halt status, execution timeout.
xchangeRouter.get("/assets", async (req: Request, res: Response) => {
  if (MOCK_MODE) { res.json({ items: MOCK_ASSETS, total: MOCK_ASSETS.length, _mock: true }); return; }
  const qs = new URLSearchParams(req.query as Record<string, string>).toString();
  await backedGet(`/trades/xchange/assets${qs ? "?" + qs : ""}`, res);
});

// GET /api/xchange/assets/:identifier
// Check isTradingHalted, minOrderFiatValue, maxOrderFiatValue, executionTimeoutSeconds.
xchangeRouter.get("/assets/:identifier", async (req: Request, res: Response) => {
  if (MOCK_MODE) {
    const asset = MOCK_ASSETS.find(a => a.identifier === req.params.identifier);
    if (!asset) { res.status(404).json({ error: "asset not found" }); return; }
    res.json({ ...asset, _mock: true });
    return;
  }
  await backedGet(`/trades/xchange/assets/${encodeURIComponent(req.params.identifier)}`, res);
});

// ── Soft quotes (price display, no commitment) ───────────────────────────────

// POST /api/xchange/soft
// Body: { identifier, side, network, quantity? | cashAmount? }
// Returns: { id, price, quantity, cashAmount, expiresAt }
// The id can be used as softQuoteId on the hard RFQ to lock in the price.
xchangeRouter.post("/soft", async (req: Request, res: Response) => {
  const { identifier, side, network, quantity, cashAmount } = req.body ?? {};

  if (!identifier || !side || !network) {
    res.status(400).json({ error: "identifier, side, and network are required" });
    return;
  }
  if (!quantity && !cashAmount) {
    res.status(400).json({ error: "supply exactly one of quantity or cashAmount" });
    return;
  }
  if (quantity && cashAmount) {
    res.status(400).json({ error: "quantity and cashAmount are mutually exclusive" });
    return;
  }

  if (MOCK_MODE) { res.json(mockSoftQuote(req.body)); return; }
  await backedPost("/trades/xchange/rfq/soft", req.body, res);
});

// ── Hard RFQ (executable quote) ──────────────────────────────────────────────

// POST /api/xchange/rfq
// Solana path body: { identifier, side, quantity|cashAmount, network:"Solana",
//                    paymentWalletIdentifier, receivingWalletIdentifier }
// OR convert soft quote: { softQuoteId, network, paymentWalletIdentifier, receivingWalletIdentifier }
//
// Response: { id, price, quantity, signature, signaturePayload, ... }
// On Solana, `signature` is a base64-encoded partially-signed VersionedTransaction.
// The client must: Buffer.from(signature, "base64") → VersionedTransaction.deserialize()
//                  → transaction.sign([wallet]) → connection.sendRawTransaction()
xchangeRouter.post("/rfq", async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const hasSoftId = !!body.softQuoteId;

  if (!hasSoftId) {
    const { identifier, side, network, paymentWalletIdentifier, receivingWalletIdentifier } = body;
    if (!identifier || !side || !network || !paymentWalletIdentifier || !receivingWalletIdentifier) {
      res.status(400).json({
        error: "required: identifier, side, network, paymentWalletIdentifier, receivingWalletIdentifier",
      });
      return;
    }
    if (!body.quantity && !body.cashAmount) {
      res.status(400).json({ error: "supply exactly one of quantity or cashAmount" });
      return;
    }
    if (body.quantity && body.cashAmount) {
      res.status(400).json({ error: "supply only one of quantity or cashAmount, not both" });
      return;
    }
  } else {
    const { network, paymentWalletIdentifier, receivingWalletIdentifier } = body;
    if (!network || !paymentWalletIdentifier || !receivingWalletIdentifier) {
      res.status(400).json({
        error: "softQuoteId path requires: network, paymentWalletIdentifier, receivingWalletIdentifier",
      });
      return;
    }
  }

  if (MOCK_MODE) { res.json(mockRfq(body)); return; }
  await backedPost("/trades/xchange/rfq", body, res);
});

// ── Quote status ─────────────────────────────────────────────────────────────

// GET /api/xchange/quote/:id
// Poll after on-chain submission.
// generalStatus: Provided → Accepted → Completed
// blockchainStatus: NotReady → PendingExecution → Executed
xchangeRouter.get("/quote/:id", async (req: Request, res: Response) => {
  if (MOCK_MODE) { res.json(mockQuoteStatus(req.params.id)); return; }
  await backedGet(`/trades/xchange/quote/${encodeURIComponent(req.params.id)}`, res);
});
