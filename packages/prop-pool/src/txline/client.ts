import axios, { type AxiosInstance } from "axios";

/**
 * Build an axios instance pre-configured with the TxLINE origin and BOTH
 * required auth headers. Every data endpoint needs `Authorization: Bearer <jwt>`
 * AND `X-Api-Token: <apiToken>` — one without the other is rejected.
 *
 * `Accept-Encoding: gzip` is set by default: the sponsor notes it cuts stream /
 * snapshot bandwidth 70–80%, which matters for a long-lived ingestion worker.
 */
export interface ClientOptions {
  apiOrigin: string;
  jwt: string;
  apiToken: string;
  timeoutMs?: number;
  gzip?: boolean;
}

export function createClient(opts: ClientOptions): AxiosInstance {
  const { apiOrigin, jwt, apiToken, timeoutMs = 30_000, gzip = true } = opts;
  return axios.create({
    baseURL: apiOrigin,
    timeout: timeoutMs,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
      "X-Api-Token": apiToken,
      ...(gzip ? { "Accept-Encoding": "gzip" } : {}),
    },
  });
}
