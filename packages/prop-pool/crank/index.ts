/**
 * PropPool settlement crank.
 *
 * Unattended worker: polls open Prop accounts past their settle-after time,
 * fetches the matching TxLINE proof, and submits settle() (CPI into
 * txoracle::validate_stat). Idempotent (skips already-settled), retries on
 * transient errors, logs every settlement with the on-chain proof link.
 *
 * Run:  npm run crank            (loop)
 *       npm run crank -- --once  (single pass, exits — used for the demo/test)
 *
 * DEVNET ONLY.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { loadConfig, PKG, type CrankConfig } from "./config";
import { authedClient, fetchProofForProp } from "./txline";
import { settleProp } from "./settle";
import { log } from "./logger";
import type { AxiosInstance } from "axios";

const idl = JSON.parse(readFileSync(resolve(PKG, "idl/prop_pool.json"), "utf8"));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isOpen = (status: any) => status && Object.prototype.hasOwnProperty.call(status, "open");

async function withRetry<T>(fn: () => Promise<T>, tries: number, baseMs: number, label: string): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const msg = (e as Error).message ?? String(e);
      // Permanent program errors — don't retry.
      if (/AlreadySettled|BucketMismatch|StatMismatch|FixtureMismatch|TooEarly/.test(msg)) throw e;
      log.warn(`${label} attempt ${i + 1}/${tries} failed`, { err: msg.slice(0, 160) });
      if (i < tries - 1) await sleep(baseMs * 2 ** i);
    }
  }
  throw last;
}

/**
 * Fetch + decode all current-layout Prop accounts, skipping any stale accounts
 * from a prior program layout (decode throws → skip) instead of failing wholesale.
 */
async function fetchProps(program: Program, connection: Connection): Promise<{ publicKey: PublicKey; account: any }[]> {
  const filters = [{ memcmp: (program.coder.accounts as any).memcmp("prop") }];
  const raw = await connection.getProgramAccounts(program.programId, { filters });
  const out: { publicKey: PublicKey; account: any }[] = [];
  for (const { pubkey, account } of raw) {
    try {
      out.push({ publicKey: pubkey, account: program.coder.accounts.decode("prop", account.data) });
    } catch {
      /* stale/old-layout account — skip */
    }
  }
  return out;
}

async function iteration(cfg: CrankConfig, program: Program, connection: Connection, client: AxiosInstance) {
  const now = Math.floor(Date.now() / 1000);
  const all = await fetchProps(program, connection);
  const ready = all.filter(
    (p: any) => isOpen(p.account.status) && Number(p.account.settleAfter) <= now
  );
  log.info("poll", { total: all.length, ready: ready.length });

  for (const { publicKey, account } of ready) {
    const propKey = publicKey.toBase58();
    const fixtureId = Number(account.fixtureId);
    try {
      const v = await fetchProofForProp(client, fixtureId, account.statKey, account.statKeyB ?? null);
      if (!v) {
        log.info("skip: no anchored stat yet", { prop: propKey, fixtureId });
        continue;
      }
      await withRetry(
        () => settleProp(program, connection, publicKey, account, v, cfg.computeUnits),
        cfg.maxRetries,
        cfg.retryBaseMs,
        `settle ${propKey}`
      );
    } catch (e) {
      log.error("settle failed", { prop: propKey, err: (e as Error).message?.slice(0, 200) });
    }
  }
}

async function main() {
  const cfg = loadConfig();
  const connection = new Connection(cfg.rpcUrl, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(cfg.wallet), { commitment: "confirmed" });
  const program = new Program(idl, provider);
  log.info("crank up", { program: program.programId.toBase58(), rpc: cfg.rpcUrl, once: cfg.runOnce });

  const client = await authedClient(connection, cfg.wallet);

  if (cfg.runOnce) {
    await iteration(cfg, program, connection, client);
    log.info("single pass done");
    return;
  }
  for (;;) {
    try {
      await iteration(cfg, program, connection, client);
    } catch (e) {
      log.error("iteration error", { err: (e as Error).message?.slice(0, 200) });
    }
    await sleep(cfg.pollIntervalMs);
  }
}

main().catch((e) => {
  log.error("crank fatal", { err: (e as Error).message });
  process.exit(1);
});
