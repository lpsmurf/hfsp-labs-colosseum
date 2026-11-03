import type {
  OddsPayload,
  Scores,
  SseMessage,
} from "./types";

/**
 * Server-Sent Events streaming for the odds and scores feeds.
 *
 * Implemented as a proper SSE frame parser per the OpenAPI spec: frames are
 * separated by a blank line; each frame has `id:`, optional `event:`, and one or
 * more `data:` lines (concatenated with "\n"). Data messages carry a JSON body
 * (a single Odds or Scores record); heartbeats arrive as `event: heartbeat`.
 *
 * NOTE: the sponsor's `stream_scores.ts` example ships a broken ad-hoc parser
 * (undefined `jwtToken`, a `"Message: "`/`substring(6)` split that doesn't match
 * the wire format). This is a correct standard-SSE implementation instead.
 *
 * Requires a global `fetch` (Node 18+). Pass an AbortSignal to stop the stream.
 */
export interface StreamOptions {
  apiOrigin: string;
  jwt: string;
  apiToken: string;
  /** Filter the stream to a single fixture. */
  fixtureId?: number;
  /** Resume from a prior event id (SSE `Last-Event-ID`). */
  lastEventId?: string;
  /** Emit heartbeat frames too (default false — data frames only). */
  includeHeartbeats?: boolean;
  signal?: AbortSignal;
  gzip?: boolean;
}

async function* streamSse<T>(
  path: string,
  opts: StreamOptions
): AsyncGenerator<SseMessage<T>> {
  const {
    apiOrigin,
    jwt,
    apiToken,
    fixtureId,
    lastEventId,
    includeHeartbeats = false,
    signal,
    gzip = true,
  } = opts;

  const url = new URL(`${apiOrigin}${path}`);
  if (fixtureId !== undefined) url.searchParams.set("fixtureId", String(fixtureId));

  const headers: Record<string, string> = {
    Authorization: `Bearer ${jwt}`,
    "X-Api-Token": apiToken,
    Accept: "text/event-stream",
    "Cache-Control": "no-cache",
    ...(gzip ? { "Accept-Encoding": "gzip" } : {}),
    ...(lastEventId ? { "Last-Event-ID": lastEventId } : {}),
  };

  const res = await fetch(url, { headers, signal });
  if (!res.ok || !res.body) {
    throw new Error(`SSE ${path} failed: ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Split complete frames on blank lines; keep the trailing partial.
      let sep: number;
      while ((sep = indexOfFrameEnd(buffer)) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep).replace(/^(\r?\n){1,2}/, "");
        const msg = parseSseFrame<T>(frame);
        if (!msg) continue;
        if (msg.event === "heartbeat" && !includeHeartbeats) continue;
        yield msg;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Index of the end of the first complete frame (a blank line), or -1. */
function indexOfFrameEnd(buffer: string): number {
  const lf = buffer.indexOf("\n\n");
  const crlf = buffer.indexOf("\r\n\r\n");
  if (lf === -1) return crlf;
  if (crlf === -1) return lf;
  return Math.min(lf, crlf);
}

/** Parse one SSE frame into an SseMessage; returns undefined for empty frames. */
export function parseSseFrame<T>(frame: string): SseMessage<T> | undefined {
  let id: string | undefined;
  let event: string | undefined;
  const dataLines: string[] = [];

  for (const rawLine of frame.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith(":")) continue; // comment / blank
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    const val = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "id") id = val;
    else if (field === "event") event = val;
    else if (field === "data") dataLines.push(val);
  }

  if (dataLines.length === 0 && !event) return undefined;

  const raw = dataLines.join("\n");
  let data: T;
  try {
    data = raw ? (JSON.parse(raw) as T) : (undefined as unknown as T);
  } catch {
    data = raw as unknown as T; // non-JSON payload (rare) — pass through
  }
  return { id, event, data };
}

/** Stream live odds updates as parsed messages. */
export function streamOdds(
  opts: StreamOptions
): AsyncGenerator<SseMessage<OddsPayload>> {
  return streamSse<OddsPayload>("/api/odds/stream", opts);
}

/** Stream live scores updates as parsed messages. */
export function streamScores(
  opts: StreamOptions
): AsyncGenerator<SseMessage<Scores>> {
  return streamSse<Scores>("/api/scores/stream", opts);
}
