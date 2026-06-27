import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyTx } from "../src/server/verify.js";

const USDC   = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const PAY_TO = "GdAWRcvrVabFi6QtciGJNYsS8cykJkZTNZ3cFea6ywfY";

function makeTxResponse(options: {
  mint?: string;
  owner?: string;
  preAmt?: string;
  postAmt?: string;
  onChainErr?: object;
}) {
  const { mint = USDC, owner = PAY_TO, preAmt = "0", postAmt = "500000", onChainErr } = options;
  return {
    result: {
      blockTime: Math.floor(Date.now() / 1000), // recent — passes the freshness window
      meta: {
        err:               onChainErr ?? null,
        preTokenBalances:  [{ accountIndex: 0, mint, owner: "sender", uiTokenAmount: { amount: preAmt } }],
        postTokenBalances: [{ accountIndex: 0, mint, owner,           uiTokenAmount: { amount: postAmt } }],
      },
      transaction: { message: { accountKeys: [{ pubkey: "senderWallet" }] } },
    },
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("verifyTx", () => {
  it("returns ok=true for valid USDC transfer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: () => Promise.resolve(makeTxResponse({})),
    }));

    const result = await verifyTx("https://rpc", "sig1", USDC, PAY_TO, 500_000n);
    expect(result.ok).toBe(true);
    expect(result.amount).toBe(500_000);
    expect(result.from).toBe("senderWallet");
  });

  it("returns ok=false when tx not found", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ result: null }),
    }));

    const result = await verifyTx("https://rpc", "sig2", USDC, PAY_TO, 500_000n);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not found/);
  });

  it("returns ok=false when tx failed on-chain", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: () => Promise.resolve(makeTxResponse({ onChainErr: { InstructionError: [0, "InsufficientFunds"] } })),
    }));

    const result = await verifyTx("https://rpc", "sig3", USDC, PAY_TO, 500_000n);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/on-chain/);
  });

  it("returns ok=false when amount is insufficient", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: () => Promise.resolve(makeTxResponse({ postAmt: "100" })),
    }));

    const result = await verifyTx("https://rpc", "sig4", USDC, PAY_TO, 500_000n);
    expect(result.ok).toBe(false);
  });

  it("returns ok=false when wrong recipient", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: () => Promise.resolve(makeTxResponse({ owner: "wrongWallet" })),
    }));

    const result = await verifyTx("https://rpc", "sig5", USDC, PAY_TO, 500_000n);
    expect(result.ok).toBe(false);
  });
});
