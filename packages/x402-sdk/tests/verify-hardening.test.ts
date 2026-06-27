import { describe, it, expect, vi, afterEach } from "vitest";
import { verifyTx } from "../src/server/verify.js";
import { USDC_MAINNET, MEMO_PROGRAM_ID } from "../src/types.js";

const MINT  = USDC_MAINNET;
const PAYTO = "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J"; // arbitrary base58 owner
const FROM  = "4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG";
const now   = () => Math.floor(Date.now() / 1000);

/** Build a fake getTransaction result with configurable freshness/amount/memo. */
function fakeTx(opts: {
  blockTime?: number | null;
  toOwner?: string;
  delta?: bigint;
  memos?: string[];
  err?: unknown;
} = {}) {
  const delta = opts.delta ?? 5_000n;
  const memoIxs = (opts.memos ?? []).map((m) => ({ program: "spl-memo", programId: MEMO_PROGRAM_ID, parsed: m }));
  return {
    blockTime: opts.blockTime === undefined ? now() - 5 : opts.blockTime,
    meta: {
      err: opts.err ?? null,
      preTokenBalances:  [{ accountIndex: 1, mint: MINT, owner: opts.toOwner ?? PAYTO, uiTokenAmount: { amount: "0" } }],
      postTokenBalances: [{ accountIndex: 1, mint: MINT, owner: opts.toOwner ?? PAYTO, uiTokenAmount: { amount: delta.toString() } }],
      innerInstructions: [],
    },
    transaction: { message: { accountKeys: [{ pubkey: FROM }], instructions: memoIxs } },
  };
}

function mockRpc(tx: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ jsonrpc: "2.0", id: 1, result: tx }) })) as any);
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("verifyTx hardening (R9 freshness, R2 resource binding)", () => {
  it("accepts a fresh, correctly-addressed transfer", async () => {
    mockRpc(fakeTx());
    const r = await verifyTx("rpc", "sig", MINT, PAYTO, 5_000n);
    expect(r.ok).toBe(true);
    expect(r.from).toBe(FROM);
  });

  it("R9: rejects a stale payment beyond the freshness window", async () => {
    mockRpc(fakeTx({ blockTime: now() - 1000 }));
    const r = await verifyTx("rpc", "sig", MINT, PAYTO, 5_000n, { maxAgeSeconds: 300 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/too old/);
  });

  it("R9: rejects a payment with a future blockTime beyond skew", async () => {
    mockRpc(fakeTx({ blockTime: now() + 500 }));
    const r = await verifyTx("rpc", "sig", MINT, PAYTO, 5_000n, { maxAgeSeconds: 300, clockSkewSeconds: 60 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/future/);
  });

  it("R9: maxAgeSeconds=0 disables the freshness check", async () => {
    mockRpc(fakeTx({ blockTime: now() - 100_000 }));
    const r = await verifyTx("rpc", "sig", MINT, PAYTO, 5_000n, { maxAgeSeconds: 0 });
    expect(r.ok).toBe(true);
  });

  it("R2: accepts when the required memo is present", async () => {
    mockRpc(fakeTx({ memos: ["/api/analyze"] }));
    const r = await verifyTx("rpc", "sig", MINT, PAYTO, 5_000n, { resourceId: "/api/analyze" });
    expect(r.ok).toBe(true);
  });

  it("R2: rejects when the resource-binding memo is missing", async () => {
    mockRpc(fakeTx({ memos: [] }));
    const r = await verifyTx("rpc", "sig", MINT, PAYTO, 5_000n, { resourceId: "/api/analyze" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not bound/);
  });

  it("R2: rejects when the memo is for a different resource", async () => {
    mockRpc(fakeTx({ memos: ["/api/other"] }));
    const r = await verifyTx("rpc", "sig", MINT, PAYTO, 5_000n, { resourceId: "/api/analyze" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not bound/);
  });

  it("regression: rejects a transfer to the wrong recipient", async () => {
    mockRpc(fakeTx({ toOwner: "SomeOtherOwner1111111111111111111111111111" }));
    const r = await verifyTx("rpc", "sig", MINT, PAYTO, 5_000n);
    expect(r.ok).toBe(false);
  });

  it("regression: rejects an underpaying transfer", async () => {
    mockRpc(fakeTx({ delta: 1_000n }));
    const r = await verifyTx("rpc", "sig", MINT, PAYTO, 5_000n);
    expect(r.ok).toBe(false);
  });
});
