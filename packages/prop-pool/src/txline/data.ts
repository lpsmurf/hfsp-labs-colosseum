import type { AxiosInstance } from "axios";
import type {
  Fixture,
  OddsPayload,
  Scores,
  ScoresStatValidation,
  ScoresStatValidationV2,
  OddsValidation,
} from "./types";
import { encodeStatKeys } from "./statKeys";

/**
 * Thin, typed wrappers over the TxLINE REST endpoints. No logic beyond path /
 * param assembly and typed responses — the client (with both auth headers) is
 * built by createClient in client.ts.
 *
 * Endpoint paths are taken from the OpenAPI spec (docs.yaml v1.5.2): fixture-id
 * scoped reads use PATH params (`/api/odds/snapshot/{fixtureId}`), not query
 * params.
 */

// ── Fixtures ──────────────────────────────────────────────────────────────────
export async function getFixturesSnapshot(
  client: AxiosInstance,
  params: { startEpochDay?: number; competitionId?: number } = {}
): Promise<Fixture[]> {
  const res = await client.get<Fixture[]>("/api/fixtures/snapshot", { params });
  return res.data;
}

// ── Odds ──────────────────────────────────────────────────────────────────────
export async function getOddsSnapshot(
  client: AxiosInstance,
  fixtureId: number,
  asOf?: number
): Promise<OddsPayload[]> {
  const res = await client.get<OddsPayload[]>(`/api/odds/snapshot/${fixtureId}`, {
    params: asOf ? { asOf } : undefined,
  });
  return res.data;
}

/** Live odds updates for a fixture (current in-memory 5-minute cache). */
export async function getOddsUpdates(
  client: AxiosInstance,
  fixtureId: number
): Promise<OddsPayload[]> {
  const res = await client.get<OddsPayload[]>(`/api/odds/updates/${fixtureId}`);
  return res.data;
}

/** Message/batch-level odds Merkle proof (feeds validateOddsOnChain). */
export async function getOddsValidation(
  client: AxiosInstance,
  messageId: string,
  ts: number
): Promise<OddsValidation> {
  const res = await client.get<OddsValidation>("/api/odds/validation", {
    params: { messageId, ts },
  });
  return res.data;
}

// ── Scores ────────────────────────────────────────────────────────────────────
export async function getScoresSnapshot(
  client: AxiosInstance,
  fixtureId: number,
  asOf?: number
): Promise<Scores[]> {
  const res = await client.get<Scores[]>(`/api/scores/snapshot/${fixtureId}`, {
    params: asOf ? { asOf } : undefined,
  });
  return res.data;
}

/** Live scores updates for a fixture (current 5-minute interval). */
export async function getScoresUpdates(
  client: AxiosInstance,
  fixtureId: number
): Promise<Scores[]> {
  const res = await client.get<Scores[]>(`/api/scores/updates/${fixtureId}`);
  return res.data;
}

/** Full historical scores sequence (fixture start 6h–2w in the past). */
export async function getScoresHistorical(
  client: AxiosInstance,
  fixtureId: number
): Promise<Scores[]> {
  const res = await client.get<Scores[]>(`/api/scores/historical/${fixtureId}`);
  return res.data;
}

/**
 * Fetch the multi-level Merkle proof for one or more statistics within a scores
 * event. Legacy mode (statKey / optional statKey2) returns ScoresStatValidation;
 * V2 mode (statKeys list) returns ScoresStatValidationV2. This wrapper returns
 * the union — narrow on the presence of `statToProve` vs `statsToProve`.
 */
export async function getStatValidation(
  client: AxiosInstance,
  args: {
    fixtureId: number;
    seq: number;
    statKey?: number;
    statKey2?: number;
    statKeys?: number[];
  }
): Promise<ScoresStatValidation | ScoresStatValidationV2> {
  const { fixtureId, seq, statKey, statKey2, statKeys } = args;
  const params: Record<string, string | number> = { fixtureId, seq };
  if (statKeys && statKeys.length) {
    params.statKeys = encodeStatKeys(statKeys);
  } else {
    if (statKey !== undefined) params.statKey = statKey;
    if (statKey2 !== undefined) params.statKey2 = statKey2;
  }
  const res = await client.get("/api/scores/stat-validation", { params });
  return res.data;
}
