/**
 * TxLINE auth for the crank — reuse the M0 cache if present, else run the full
 * guest -> subscribe -> activate flow. Returns an authed axios client + a helper
 * to fetch the stat validation (proof) for a prop.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AxiosInstance } from "axios";
import { Connection, Keypair } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";
import {
  makeProvider,
  loadProgram as loadTxoracle,
  networkConfig,
  startGuestSession,
  subscribeFreeWorldCup,
  signAndActivate,
  createClient,
  getScoresSnapshot,
  getStatValidation,
} from "../src/txline/index";
import type { ScoresStatValidation, Scores } from "../src/txline/index";
import { PKG } from "./config";
import { log } from "./logger";

const cfg = networkConfig("devnet");
const CACHE = resolve(PKG, ".m0-cache.json");

export async function authedClient(connection: Connection, wallet: Keypair): Promise<AxiosInstance> {
  const pk = wallet.publicKey.toBase58();
  let jwt: string, apiToken: string;
  if (existsSync(CACHE)) {
    const c = JSON.parse(readFileSync(CACHE, "utf8"));
    if (c.pubkey === pk) {
      log.info("txline: reusing cached auth");
      return createClient({ apiOrigin: cfg.apiOrigin, jwt: c.jwt, apiToken: c.apiToken });
    }
  }
  log.info("txline: running guest -> subscribe -> activate");
  jwt = await startGuestSession(cfg.apiOrigin);
  const program = loadTxoracle(makeProvider(connection, new Wallet(wallet)), "devnet");
  const { txSig } = await subscribeFreeWorldCup(program);
  apiToken = await signAndActivate(cfg.apiOrigin, jwt, txSig, [], wallet.secretKey);
  writeFileSync(CACHE, JSON.stringify({ pubkey: pk, jwt, apiToken }, null, 2));
  return createClient({ apiOrigin: cfg.apiOrigin, jwt, apiToken });
}

/**
 * Find the latest scored-event `seq` for a fixture that contains the prop's
 * stat key(s), then fetch its multi-level Merkle proof. Returns null if no such
 * event is anchored yet (match not finished / stat not present).
 */
export async function fetchProofForProp(
  client: AxiosInstance,
  fixtureId: number,
  statKey: number,
  statKeyB: number | null
): Promise<ScoresStatValidation | null> {
  let scores: Scores[];
  try {
    scores = await getScoresSnapshot(client, fixtureId);
  } catch {
    return null;
  }
  const has = (s: Scores) =>
    s.Stats && String(statKey) in s.Stats && (statKeyB == null || String(statKeyB) in s.Stats);
  const row = [...scores].reverse().find(has);
  if (!row) return null;
  const v = (await getStatValidation(client, {
    fixtureId,
    seq: row.Seq,
    statKey,
    statKey2: statKeyB ?? undefined,
  })) as ScoresStatValidation;
  return v;
}
