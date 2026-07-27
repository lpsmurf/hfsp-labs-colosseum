import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import { x402 } from "../src/server/index.js";
import { MemoryReplayStore } from "../src/server/replay.js";

function mockReqRes(headers: Record<string, string> = {}) {
  const req = {
    headers,
    protocol:    "https",
    originalUrl: "/api/analyze",
    get: (h: string) => (h === "host" ? "api.example.com" : undefined),
  } as unknown as Request;

  const res: any = {
    status: vi.fn().mockReturnThis(),
    json:   vi.fn().mockReturnThis(),
    set:    vi.fn().mockReturnThis(),
  };

  const next = vi.fn();
  return { req, res, next };
}

describe("x402 middleware", () => {
  it("returns 402 when no tx header present", async () => {
    const mw = x402({ amount: 500_000n, payTo: "GdAWR...", rpcUrl: "https://rpc" });
    const { req, res, next } = mockReqRes();

    await mw(req, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(402);
    expect(next).not.toHaveBeenCalled();
  });

  it("includes PAYMENT-REQUIRED header in 402 response", async () => {
    const mw = x402({ amount: 500_000n, payTo: "GdAWR...", rpcUrl: "https://rpc" });
    const { req, res, next } = mockReqRes();

    await mw(req, res as unknown as Response, next);

    expect(res.set).toHaveBeenCalledWith("PAYMENT-REQUIRED", expect.any(String));
    const encoded = res.set.mock.calls[0][1] as string;
    const decoded = JSON.parse(Buffer.from(encoded, "base64").toString());
    expect(decoded.x402Version).toBe(2);
    expect(decoded.accepts[0].amount).toBe("500000");
  });

  it("rejects replayed tx signatures", async () => {
    const replay = new MemoryReplayStore();
    await replay.claim("already-used-sig");

    // Stub verifyTx so it never gets called
    const mw = x402({ amount: 500_000n, payTo: "GdAWR...", rpcUrl: "https://rpc", replayStore: replay });
    const { req, res, next } = mockReqRes({ "x-solana-tx": "already-used-sig" });

    await mw(req, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(402);
    const body = res.json.mock.calls[0][0];
    expect(body.code).toBe("TX_ALREADY_USED");
  });
});
