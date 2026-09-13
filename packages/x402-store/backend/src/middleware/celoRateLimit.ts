// Rate limits for the Celo rail.
//
// Every quote opens a Cryptorefills session and asks Relay for a route, so an
// unthrottled client could get us rate-limited upstream or fill redis with
// quotes. Limits are per client IP, which nginx passes in X-Real-IP for these
// routes only. The store keeps no logs: the IP is hashed with a per-process salt
// and lives only in this process's memory for the length of the window.
import { createHash, randomBytes } from "node:crypto";
import type { Request, RequestHandler } from "express";
import rateLimit from "express-rate-limit";

const SALT = randomBytes(16);

// Our own hosts (e.g. the MCP server calling the store) share one IP for every
// agent behind them; they are exempt here and rate-limit their own callers.
const EXEMPT = new Set((process.env.RATE_LIMIT_EXEMPT_IPS ?? "").split(",").map(s => s.trim()).filter(Boolean));

export function clientIp(req: Pick<Request, "socket" | "get">): string {
  // Only trust X-Real-IP when the request came through the local proxy.
  const peer = req.socket.remoteAddress ?? "";
  const viaProxy = peer === "127.0.0.1" || peer === "::1" || peer === "::ffff:127.0.0.1";
  const forwarded = req.get("x-real-ip");
  return viaProxy && forwarded ? forwarded : peer;
}

const keyOf = (req: Pick<Request, "socket" | "get">) => createHash("sha256").update(SALT).update(clientIp(req)).digest("hex").slice(0, 32);

// express-rate-limit ships its own @types/express, which may resolve to a
// different major than the app's (this package runs Express 4; the MCP package
// pulls Express 5 types). The callbacks below are structurally compatible with
// both, so they take `any` and the result is exposed as a plain RequestHandler
// to keep the app's router typing independent of which version wins resolution.
const limiter = (windowMs: number, limit: number, message: string): RequestHandler => rateLimit({
  windowMs,
  limit,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req: any) => keyOf(req),
  skip: (req: any) => EXEMPT.has(clientIp(req)),
  // The key is a salted hash, not an IP; skip express-rate-limit's IP checks.
  validate: false,
  handler: (_req: any, res: any) => { res.status(429).json({ ok: false, code: "RATE_LIMITED", error: message }); },
}) as unknown as RequestHandler;

/** Pricing: each call costs an upstream quote. */
export const quoteLimit = limiter(10 * 60_000, 30, "Too many price requests. Wait a few minutes and try again.");

/** Payment confirmation: the page retries while a block lands. */
export const confirmLimit = limiter(10 * 60_000, 60, "Too many confirmation attempts. Wait a minute and try again.");

/** Status polling. */
export const statusLimit = limiter(60_000, 60, "Too many status checks. Poll every few seconds, not faster.");
