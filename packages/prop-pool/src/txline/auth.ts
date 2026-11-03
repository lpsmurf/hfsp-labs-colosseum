import axios, { type AxiosInstance } from "axios";
import nacl from "tweetnacl";
import type { ActivationPayload, TokenResponse } from "./types";

/**
 * Auth flow for the TxLINE off-chain API, wrapped exactly as the quickstart /
 * runnable examples specify.
 *
 * 1. `startGuestSession` → anonymous JWT (30-day expiry).
 * 2. on-chain `subscribe` tx (see subscribe.ts) → txSig.
 * 3. `buildActivationSignature` → base64 detached signature binding txSig +
 *    leagues + jwt.
 * 4. `activateToken` → long-lived API token.
 *
 * Every subsequent data call needs BOTH headers: `Authorization: Bearer <jwt>`
 * and `X-Api-Token: <apiToken>` (see client.ts).
 */

/** POST /auth/guest/start → guest JWT. */
export async function startGuestSession(apiOrigin: string): Promise<string> {
  const res = await axios.post<TokenResponse>(`${apiOrigin}/auth/guest/start`);
  return res.data.token;
}

/**
 * Build the base64 wallet signature the activation endpoint requires.
 *
 * The signed message is the strict binding `${txSig}:${leagues.join(",")}:${jwt}`
 * (colon-separated), signed as a detached ed25519 signature over the UTF-8
 * bytes with the wallet secret key, then base64-encoded. This exact format is
 * taken from the sponsor's examples — deviating from it fails activation.
 */
export function buildActivationSignature(
  txSig: string,
  leagues: number[],
  jwt: string,
  secretKey: Uint8Array
): string {
  const messageString = `${txSig}:${leagues.join(",")}:${jwt}`;
  const message = new TextEncoder().encode(messageString);
  const signatureBytes = nacl.sign.detached(message, secretKey);
  return Buffer.from(signatureBytes).toString("base64");
}

/**
 * POST /api/token/activate → long-lived API token.
 *
 * The endpoint returns the token as plain text (not JSON); some deployments
 * wrap it as `{ token }`, so we accept either shape.
 */
export async function activateToken(
  apiOrigin: string,
  jwt: string,
  payload: ActivationPayload
): Promise<string> {
  const res = await axios.post(`${apiOrigin}/api/token/activate`, payload, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  return typeof res.data === "string" ? res.data : res.data.token;
}

/**
 * Convenience: sign + activate in one call given the confirmed subscribe txSig.
 * `secretKey` is the wallet's 64-byte ed25519 secret key (e.g.
 * `keypair.secretKey`).
 */
export async function signAndActivate(
  apiOrigin: string,
  jwt: string,
  txSig: string,
  leagues: number[],
  secretKey: Uint8Array
): Promise<string> {
  const walletSignature = buildActivationSignature(txSig, leagues, jwt, secretKey);
  return activateToken(apiOrigin, jwt, { txSig, walletSignature, leagues });
}

// Re-export for callers that want the axios type without a separate import.
export type { AxiosInstance };
