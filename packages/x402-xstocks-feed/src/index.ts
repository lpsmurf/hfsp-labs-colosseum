import "dotenv/config";
import express, { type RequestHandler } from "express";
import helmet  from "helmet";
import cors    from "cors";
import { x402, type BazaarConfig } from "@hfsp/x402-sdk";
import { config } from "./config.js";

const app  = express();
const BASE = "https://api.backed.fi/api/v2/public";

app.use(helmet());
app.use(cors());
app.set("trust proxy", 1);

// ── Payment middleware ────────────────────────────────────────────────────────

function gate(bazaar: BazaarConfig): RequestHandler {
  // Double cast: @hfsp/x402-sdk returns an async (req,res,next) handler, but a
  // duplicate @types/express in the tree makes its inferred type structurally
  // incompatible with this package's RequestHandler. The runtime shape is
  // identical, so we assert through `unknown`.
  return x402({
    amount:      config.pricePerCall,
    payTo:       config.payTo,
    rpcUrl:      config.heliusRpc,
    description: "xStocks price feed — $0.005 USDC per call on Solana",
    bazaar,
  }) as unknown as RequestHandler;
}

// Reusable schema fragments (clean JSON Schema — no example inside property defs)
const assetProps = {
  id:               { type: "string" },
  name:             { type: "string" },
  symbol:           { type: "string" },
  isin:             { type: "string" },
  underlyingSymbol: { type: "string" },
  isTradingHalted:  { type: "boolean" },
  deployments:      { type: "array", items: { type: "object" } },
};

const assetSchema  = { type: "object", properties: assetProps };
const paginatedSchema = { type: "object", properties: { page: { type: "object" }, nodes: { type: "array", items: { type: "object" } } } };

// path-param schema shared across symbol routes
const symPathSchema  = { properties: { symbol: { type: "string", description: "xStock asset symbol e.g. AAPLx" } } };
const netQSchema     = { properties: { network: { type: "string" }, page: { type: "integer" }, pageSize: { type: "integer" } } };
const pageQSchema    = { properties: { page: { type: "integer" }, pageSize: { type: "integer" } } };
const caQSchema      = { properties: { symbol: { type: "string" }, page: { type: "integer" }, pageSize: { type: "integer" } } };

const gates = {
  assets:     gate({ queryParams: { network: "Solana", page: 1, pageSize: 10 }, queryParamsSchema: netQSchema, output: { example: [{ symbol: "AAPLx", name: "Apple Inc.", underlyingSymbol: "AAPL", isTradingHalted: false }], schema: { type: "array", items: assetSchema } } }),
  asset:      gate({ pathParams: { symbol: "AAPLx" }, pathParamsSchema: symPathSchema, queryParams: { network: "Solana" }, queryParamsSchema: { properties: { network: { type: "string" } } }, output: { example: { symbol: "AAPLx", name: "Apple Inc.", isin: "US0378331005", isTradingHalted: false }, schema: assetSchema } }),
  price:      gate({ pathParams: { symbol: "AAPLx" }, pathParamsSchema: symPathSchema, output: { example: { value: 201.50 }, schema: { type: "object", properties: { value: { type: "number" } }, required: ["value"] } } }),
  multiplier: gate({ pathParams: { symbol: "AAPLx" }, pathParamsSchema: symPathSchema, output: { example: { value: 1.0023 }, schema: { type: "object", properties: { value: { type: "number" } }, required: ["value"] } } }),
  mulHistory: gate({ pathParams: { symbol: "AAPLx" }, pathParamsSchema: symPathSchema, queryParams: { page: 1, pageSize: 10 }, queryParamsSchema: pageQSchema, output: { example: { page: {}, nodes: [] }, schema: paginatedSchema } }),
  supply:     gate({ pathParams: { symbol: "AAPLx" }, pathParamsSchema: symPathSchema, output: { example: { symbol: "AAPLx", circulatingSupply: "1000000", sharesHeld: "1000000" }, schema: { type: "object", properties: { symbol: { type: "string" }, circulatingSupply: { type: "string" }, sharesHeld: { type: "string" } } } } }),
  reserves:   gate({ queryParams: { network: "Solana", page: 1, pageSize: 10 }, queryParamsSchema: netQSchema, output: { example: { page: {}, nodes: [] }, schema: paginatedSchema } }),
  reserveSym: gate({ pathParams: { symbol: "AAPLx" }, pathParamsSchema: symPathSchema, output: { example: { symbol: "AAPLx", timestamp: "2025-01-01T00:00:00Z" }, schema: { type: "object", properties: { symbol: { type: "string" }, timestamp: { type: "string" } } } } }),
  oracles:    gate({ queryParams: { network: "Solana", page: 1, pageSize: 10 }, queryParamsSchema: netQSchema, output: { example: { nodes: [] }, schema: { type: "object", properties: { nodes: { type: "array", items: { type: "object" } } } } } }),
  oracleSym:  gate({ pathParams: { symbol: "AAPLx" }, pathParamsSchema: symPathSchema, queryParams: { network: "Solana" }, queryParamsSchema: { properties: { network: { type: "string" } } }, output: { example: { nodes: [] }, schema: { type: "object", properties: { nodes: { type: "array", items: { type: "object" } } } } } }),
  status:     gate({ pathParams: { symbol: "AAPLx" }, pathParamsSchema: symPathSchema, output: { example: { symbol: "AAPLx", isMarketTradingHalted: false, isAtomicTradingHalted: false }, schema: { type: "object", properties: { symbol: { type: "string" }, isMarketTradingHalted: { type: "boolean" }, isAtomicTradingHalted: { type: "boolean" } } } } }),
  caHistory:  gate({ queryParams: { symbol: "AAPLx", page: 1, pageSize: 10 }, queryParamsSchema: caQSchema, output: { example: { page: {}, nodes: [] }, schema: paginatedSchema } }),
  caUpcoming: gate({ queryParams: { symbol: "AAPLx", page: 1, pageSize: 10 }, queryParamsSchema: caQSchema, output: { example: { page: {}, nodes: [] }, schema: paginatedSchema } }),
};

// ── Backed proxy helper — forwards query string to upstream ──────────────────
async function proxy(path: string, res: express.Response, qs?: string): Promise<void> {
  const url = `${BASE}${path}${qs ? `?${qs}` : ""}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      // Don't echo the upstream body — it can leak internal error detail.
      console.error('[feed] upstream returned non-JSON', { status: r.status, contentType: ct });
      res.status(502).json({ error: 'upstream returned non-JSON' });
      return;
    }
    const body = await r.json();
    res.status(r.status).json(body);
  } catch (err) {
    if ((err as any).name === 'AbortError') {
      console.error('[feed] upstream timeout', err);
      res.status(504).json({ error: 'upstream timeout' });
    } else {
      console.error('[feed] upstream error', err);
      res.status(502).json({ error: 'upstream error' });
    }
  } finally {
    clearTimeout(timeout);
  }
}

// Validate symbols to avoid open-redirect style requests reaching upstream.
function validateSymbol(sym: string): string {
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(sym)) throw new Error('invalid symbol');
  return encodeURIComponent(sym);
}

// ── OpenAPI discovery doc (draft-payment-discovery-00 / x402scan) ────────────

const PAYMENT_OFFER = {
  intent:      "charge",
  method:      "x402",
  amount:      String(config.pricePerCall),
  currency:    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  description: `$${Number(config.pricePerCall) / 1e6} USDC per call, paid on Solana`,
};

const symbolParam = { name: "symbol", in: "path", required: true, schema: { type: "string" }, description: "xStock asset symbol (e.g. AAPLx, TSLAx)" };
const networkParam = { name: "network", in: "query", required: false, schema: { type: "string", example: "Solana" }, description: "Filter by network (e.g. Solana, Ethereum, Polygon)" };
const pageParam    = { name: "page",    in: "query", required: false, schema: { type: "integer", default: 1 }, description: "Page number (1-based)" };
const pageSizeParam= { name: "pageSize",in: "query", required: false, schema: { type: "integer", default: 10, maximum: 100 }, description: "Items per page" };
const fromParam    = { name: "from",    in: "query", required: false, schema: { type: "string", format: "date-time" }, description: "Filter events from this ISO 8601 timestamp" };
const toParam      = { name: "to",      in: "query", required: false, schema: { type: "string", format: "date-time" }, description: "Filter events up to this ISO 8601 timestamp" };
const symbolQParam = { name: "symbol",  in: "query", required: false, schema: { type: "string" }, description: "Filter by xStock symbol" };

const paginatedResponse = {
  type: "object",
  properties: {
    page: {
      type: "object",
      properties: {
        currentPage:     { type: "integer" },
        pageSize:        { type: "integer" },
        totalPages:      { type: "integer" },
        totalNodes:      { type: "integer" },
        hasNextPage:     { type: "boolean" },
        hasPreviousPage: { type: "boolean" },
      },
    },
    nodes: { type: "array", items: { type: "object" } },
  },
};

const gatedOp = (summary: string, params: object[], responseSchema: object) => ({
  summary,
  parameters: params,
  "x-payment-info": { offers: [PAYMENT_OFFER] },
  responses: {
    "200": {
      description: "Successful response",
      content: { "application/json": { schema: responseSchema } },
    },
    "402": { description: "Payment Required" },
  },
});

const openApiDoc = {
  openapi: "3.1.0",
  info: {
    title:       "xStocks Price Feed",
    version:     "1.0.0",
    description: "Pay-per-request xStocks price oracle powered by Backed Assets. $0.005 USDC per call on Solana.",
    contact:     { email: "info@hfsp.xyz", url: "https://hfsp.xyz" },
  },
  "x-service-info": {
    categories: ["data", "finance"],
    docs: {
      homepage:     "https://feed.xstocks.hfsp.cloud",
      apiReference: "https://feed.xstocks.hfsp.cloud/openapi.json",
    },
  },
  servers: [{ url: "https://feed.xstocks.hfsp.cloud" }],
  paths: {
    "/assets": {
      get: gatedOp("List all xStock assets", [networkParam, pageParam, pageSizeParam], {
        type: "array",
        items: {
          type: "object",
          properties: {
            id:                { type: "string", format: "uuid" },
            name:              { type: "string" },
            symbol:            { type: "string", example: "AAPLx" },
            isin:              { type: "string" },
            underlyingSymbol:  { type: "string", example: "AAPL" },
            underlyingIsin:    { type: "string" },
            description:       { type: "string" },
            logo:              { type: "string", format: "uri" },
            isTradingHalted:   { type: "boolean" },
            deployments:       { type: "array", items: { type: "object" } },
          },
        },
      }),
    },
    "/assets/{symbol}": {
      get: gatedOp("Get asset details by symbol", [symbolParam, networkParam], {
        type: "object",
        properties: {
          id:               { type: "string", format: "uuid" },
          name:             { type: "string" },
          symbol:           { type: "string" },
          isin:             { type: "string" },
          underlyingSymbol: { type: "string" },
          underlyingIsin:   { type: "string" },
          description:      { type: "string" },
          logo:             { type: "string", format: "uri" },
          isTradingHalted:  { type: "boolean" },
          deployments:      { type: "array", items: { type: "object" } },
        },
      }),
    },
    "/assets/{symbol}/price": {
      get: gatedOp("Get live NAV price for a symbol", [symbolParam], {
        type: "object",
        properties: {
          value: { type: "number", description: "Current price in USD" },
        },
        required: ["value"],
      }),
    },
    "/assets/{symbol}/multiplier": {
      get: gatedOp("Get current rebase multiplier for a symbol", [symbolParam], {
        type: "object",
        properties: {
          value: { type: "number", description: "Cumulative rebase multiplier (adjusts for dividends/splits)" },
        },
        required: ["value"],
      }),
    },
    "/assets/{symbol}/multiplier/history": {
      get: gatedOp("Get multiplier history for a symbol", [symbolParam, pageParam, pageSizeParam], paginatedResponse),
    },
    "/assets/{symbol}/supply": {
      get: gatedOp("Get circulating supply for a symbol", [symbolParam], {
        type: "object",
        properties: {
          symbol:            { type: "string" },
          timestamp:         { type: "string", format: "date-time" },
          sharesHeld:        { type: "string", description: "Integer share count held by custodian" },
          circulatingSupply: { type: "string", description: "On-chain token supply as decimal string" },
          holdings: {
            type: "array",
            items: {
              type: "object",
              properties: {
                provider: { type: "string" },
                quantity: { type: "string" },
                symbol:   { type: "string" },
              },
            },
          },
        },
      }),
    },
    "/reserves": {
      get: gatedOp("Get proof-of-reserves for all assets", [networkParam, pageParam, pageSizeParam], paginatedResponse),
    },
    "/reserves/{symbol}": {
      get: gatedOp("Get proof-of-reserves for a symbol", [symbolParam], {
        type: "object",
        properties: {
          symbol:    { type: "string" },
          timestamp: { type: "string", format: "date-time" },
          quote:     { type: ["object", "null"] },
        },
      }),
    },
    "/oracles": {
      get: gatedOp("List on-chain oracle addresses for all assets", [networkParam, pageParam, pageSizeParam], {
        type: "object",
        properties: {
          nodes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id:         { type: "string" },
                network:    { type: "string" },
                name:       { type: "string" },
                symbol:     { type: "string" },
                address:    { type: ["string", "null"] },
                feedType:   { type: "string" },
                managedBy:  { type: "string" },
                metadata:   { type: "object" },
              },
            },
          },
        },
      }),
    },
    "/oracles/{symbol}": {
      get: gatedOp("Get on-chain oracle addresses for a symbol", [symbolParam, networkParam], {
        type: "object",
        properties: {
          nodes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id:        { type: "string" },
                network:   { type: "string" },
                name:      { type: "string" },
                symbol:    { type: "string" },
                address:   { type: ["string", "null"] },
                feedType:  { type: "string" },
                managedBy: { type: "string" },
              },
            },
          },
        },
      }),
    },
    "/status/{symbol}": {
      get: gatedOp("Get trading halt / market status for a symbol", [symbolParam], {
        type: "object",
        properties: {
          symbol:                 { type: "string" },
          isMarketTradingHalted:  { type: "boolean" },
          isAtomicTradingHalted:  { type: "boolean" },
        },
        required: ["symbol", "isMarketTradingHalted", "isAtomicTradingHalted"],
      }),
    },
    "/corporate-actions/history": {
      get: gatedOp("List historical corporate actions (dividends, splits)", [symbolQParam, fromParam, toParam, pageParam, pageSizeParam], {
        ...paginatedResponse,
        properties: {
          ...paginatedResponse.properties,
          nodes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                eventId:           { type: "string", format: "uuid" },
                xstockSymbol:      { type: "string" },
                caType:            { type: "string", enum: ["CashDividend", "StockSplit", "Merger"] },
                effectiveTimeUtc:  { type: "string", format: "date-time" },
                multiplierOld:     { type: "string" },
                multiplierNew:     { type: "string" },
                grossCashflowUsd:  { type: ["string", "null"] },
                netCashflowUsd:    { type: ["string", "null"] },
                status:            { type: "string" },
              },
            },
          },
        },
      }),
    },
    "/corporate-actions/upcoming": {
      get: gatedOp("List upcoming corporate actions", [symbolQParam, fromParam, toParam, pageParam, pageSizeParam], paginatedResponse),
    },
  },
};

app.get("/openapi.json", (_req, res) => {
  res.setHeader("Cache-Control", "max-age=300");
  res.json(openApiDoc);
});

// ── Free endpoints ────────────────────────────────────────────────────────────

app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "x402-xstocks-feed", pricePerCall: `$${Number(config.pricePerCall) / 1e6}` })
);

app.get("/", (_req, res) => res.json({
  service:     "x402-xstocks-feed",
  description: "Pay-per-request xStocks price oracle. $0.005 USDC per call on Solana.",
  price:       `${Number(config.pricePerCall)} micro-USDC ($${Number(config.pricePerCall) / 1e6})`,
  payTo:       config.payTo,
  instructions: "Send payment, then retry with X-Solana-Tx: <signature>",
  endpoints: {
    assets:            "GET /assets",
    asset:             "GET /assets/:symbol",
    price:             "GET /assets/:symbol/price",
    multiplier:        "GET /assets/:symbol/multiplier",
    multiplierHistory: "GET /assets/:symbol/multiplier/history",
    supply:            "GET /assets/:symbol/supply",
    proofOfReserves:   "GET /reserves/:symbol",
    allReserves:       "GET /reserves",
    oracle:            "GET /oracles/:symbol",
    tradingStatus:     "GET /status/:symbol",
    dividends:         "GET /corporate-actions/history",
    upcoming:          "GET /corporate-actions/upcoming",
  },
}));

// ── Gated endpoints ($0.005 USDC each) ───────────────────────────────────────

const qs = (req: express.Request) => {
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.query)) {
    if (typeof v === "string") flat[k] = v;
    else if (Array.isArray(v) && typeof v[0] === "string") flat[k] = v[0] as string;
  }
  return new URLSearchParams(flat).toString();
};

const sym = (req: express.Request) => validateSymbol(String(req.params["symbol"]));

app.get("/assets",                               gates.assets,     (req, res) => proxy("/assets", res, qs(req)));
app.get("/assets/:symbol",                       gates.asset,      (req, res) => proxy(`/assets/${sym(req)}`, res, qs(req)));
app.get("/assets/:symbol/price",                 gates.price,      (req, res) => proxy(`/assets/${sym(req)}/price-data`, res, qs(req)));
app.get("/assets/:symbol/multiplier",            gates.multiplier, (req, res) => proxy(`/assets/${sym(req)}/multiplier`, res, qs(req)));
app.get("/assets/:symbol/multiplier/history",    gates.mulHistory, (req, res) => proxy(`/assets/${sym(req)}/multiplier/history`, res, qs(req)));
app.get("/assets/:symbol/supply",                gates.supply,     (req, res) => proxy(`/assets/${sym(req)}/circulating-supply`, res, qs(req)));
app.get("/reserves",                             gates.reserves,   (req, res) => proxy("/proof-of-reserves", res, qs(req)));
app.get("/reserves/:symbol",                     gates.reserveSym, (req, res) => proxy(`/proof-of-reserves/${sym(req)}`, res, qs(req)));
app.get("/oracles",                              gates.oracles,    (req, res) => proxy("/oracles", res, qs(req)));
app.get("/oracles/:symbol",                      gates.oracleSym,  (req, res) => proxy(`/oracles/${sym(req)}`, res, qs(req)));
app.get("/status/:symbol",                       gates.status,     (req, res) => proxy(`/system/status/${sym(req)}`, res, qs(req)));
app.get("/corporate-actions/history",            gates.caHistory,  (req, res) => proxy("/corporate-actions/history", res, qs(req)));
app.get("/corporate-actions/upcoming",           gates.caUpcoming, (req, res) => proxy("/corporate-actions/upcoming", res, qs(req)));

app.use((_req, res) => res.status(404).json({ error: "not found" }));

app.listen(Number(config.port), () => {
  console.log(`[x402-xstocks-feed] :${config.port}  $${Number(config.pricePerCall) / 1e6}/call → ${config.payTo.slice(0, 8)}…`);
});
