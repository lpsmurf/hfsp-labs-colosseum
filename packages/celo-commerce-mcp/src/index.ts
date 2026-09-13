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
  app.all("/mcp", (req, res) => void node(req, res, req.body));
  app.get("/health", (_req, res) => { res.json({ ok: true }); });
  app.listen(httpPort, host, () => console.error(`[celo-commerce-mcp] HTTP on http://${host}:${httpPort}/mcp → store ${STORE_URL}`));
} else {
  void serveStdio(createServer);
  const wallet = localWalletAddress();
  console.error(`[celo-commerce-mcp] stdio → store ${STORE_URL}${wallet ? ` · paying from ${wallet}` : " · no wallet (x402 payment via client)"}`);
}
