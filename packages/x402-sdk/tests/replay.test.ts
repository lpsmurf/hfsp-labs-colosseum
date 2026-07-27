import { describe, it, expect } from "vitest";
import { MemoryReplayStore } from "../src/server/replay.js";

describe("MemoryReplayStore", () => {
  it("returns true on first claim", async () => {
    const store = new MemoryReplayStore();
    expect(await store.claim("sig1")).toBe(true);
  });

  it("returns false on duplicate claim", async () => {
    const store = new MemoryReplayStore();
    await store.claim("sig2");
    expect(await store.claim("sig2")).toBe(false);
  });

  it("allows re-claim after release", async () => {
    const store = new MemoryReplayStore();
    await store.claim("sig3");
    await store.release("sig3");
    expect(await store.claim("sig3")).toBe(true);
  });
});
