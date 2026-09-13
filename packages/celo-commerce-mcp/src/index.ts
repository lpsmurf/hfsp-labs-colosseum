#!/usr/bin/env node
// Entry point. stdio by default (a host launches this as a local process);
// set MCP_HTTP_PORT to serve Streamable HTTP at /mcp for remote clients.
import { createMcpHandler } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer, STORE_URL } from "./server.js";
import { localWalletAddress } from "./wallet.js";

const httpPort = process.env.MCP_HTTP_PORT ? Number(process.env.MCP_HTTP_PORT) : undefined;

if (httpPort) {
  // A public HTTP server must never hold a buyer's key: payment comes from the
  // client via _meta["x402/payment"], or not at all.
  if (localWalletAddress()) {
    console.error("[celo-commerce-mcp] Refusing to start HTTP with CELO_BUYER_PRIVATE_KEY set — remote callers would spend that wallet.");
    process.exit(1);
  }
  const { createMcpExpressApp } = await import("@modelcontextprotocol/express");
  const { toNodeHandler } = await import("@modelcontextprotocol/node");
  const host = process.env.MCP_HTTP_HOST ?? "127.0.0.1";
  const allowedHosts = process.env.MCP_ALLOWED_HOSTS?.split(",").map(h => h.trim()).filter(Boolean);
  const app = createMcpExpressApp({ host, ...(allowedHosts?.length ? { allowedHosts } : {}) });
  const node = toNodeHandler(createMcpHandler(createServer));

  // The store sees every agent behind this server as one IP, so limit callers
  // here: a fixed window per client (X-Real-IP from the local proxy only),
  // counted in memory and never logged.
  const WINDOW_MS = 60_000, LIMIT = Number(process.env.MCP_RATE_LIMIT_PER_MIN ?? "60");
  const hits = new Map<string, { count: number; resetAt: number }>();
  app.use("/mcp", (req, res, next) => {
    const peer = req.socket.remoteAddress ?? "";
    const local = peer === "127.0.0.1" || peer === "::1" || peer === "::ffff:127.0.0.1";
    const client = (local && req.get("x-real-ip")) || peer;
    const now = Date.now();
    if (hits.size > 50_000) for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
    const entry = hits.get(client);
    if (!entry || entry.resetAt < now) hits.set(client, { count: 1, resetAt: now + WINDOW_MS });
    else if (++entry.count > LIMIT) {
      res.status(429).set("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)))
        .json({ jsonrpc: "2.0", error: { code: -32000, message: "Rate limited: too many requests. Retry shortly." }, id: null });
      return;
    }
    next();
  });
  app.all("/mcp", (req, res) => void node(req, res, req.body));
  app.get("/health", (_req, res) => { res.json({ ok: true }); });
  app.listen(httpPort, host, () => console.error(`[celo-commerce-mcp] HTTP on http://${host}:${httpPort}/mcp → store ${STORE_URL}`));
} else {
  void serveStdio(createServer);
  const wallet = localWalletAddress();
  console.error(`[celo-commerce-mcp] stdio → store ${STORE_URL}${wallet ? ` · paying from ${wallet}` : " · no wallet (x402 payment via client)"}`);
}
