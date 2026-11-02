// Verify Cryptorefills' signed 402 before we ever sign a payment.
//
// payTo is a fresh per-session deposit wallet, so no allowlist can vouch for it;
// the gateway signs every 402 (X-Payment-Required-Signature, a JWS/ES256) binding
// the session, the exact PAYMENT-REQUIRED bytes, payTo and network. Verifying it
// closes the gap TLS alone leaves — a compromised edge or CDN swapping payTo.
// Spec: Cryptorefills/agents skills/cryptorefills-x402/references/protocol.md.
//
// Uses Node's built-in webcrypto for ES256; no extra dependency.
import { createHash, webcrypto } from "node:crypto";

interface Jwk { kty: string; crv: string; kid: string; x: string; y: string; alg?: string }
interface Claims { iss: string; iat: number; exp: number; sid: string; pr_sha256: string; pay_to: string; network: string }

export class AttestationError extends Error {}

const b64urlToBuf = (s: string) => Buffer.from(s, "base64url");
const CACHE_MS = 60 * 60_000;
const jwksCache = new Map<string, { at: number; keys: Map<string, CryptoKey> }>();

async function importKey(jwk: Jwk): Promise<CryptoKey> {
  return webcrypto.subtle.importKey("jwk", { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
    { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
}

async function jwksFor(origin: string, force = false): Promise<Map<string, CryptoKey>> {
  const cached = jwksCache.get(origin);
  if (!force && cached && Date.now() - cached.at < CACHE_MS) return cached.keys;
  // jwks_uri is same-origin by contract; we hardcode the origin rather than
  // trusting a url from the manifest, so a tampered manifest cannot redirect it.
  const res = await fetch(`${origin}/.well-known/x402-jwks.json`, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new AttestationError(`Cannot load attestation keys (${res.status})`);
  const body = await res.json() as { keys: Jwk[] };
  const keys = new Map<string, CryptoKey>();
  for (const jwk of body.keys ?? []) {
    if (jwk.kty === "EC" && jwk.crv === "P-256" && jwk.kid) keys.set(jwk.kid, await importKey(jwk));
  }
  jwksCache.set(origin, { at: Date.now(), keys });
  return keys;
}

async function verifiedClaims(origin: string, jws: string): Promise<Claims> {
  const [h, p, s] = jws.split(".");
  if (!h || !p || !s) throw new AttestationError("Malformed attestation token");
  const header = JSON.parse(b64urlToBuf(h).toString()) as { alg?: string; kid?: string };
  if (header.alg !== "ES256") throw new AttestationError(`Unexpected attestation alg ${header.alg}`);
  if (!header.kid) throw new AttestationError("Attestation token has no kid");

  let keys = await jwksFor(origin);
  let key = keys.get(header.kid);
  if (!key) { keys = await jwksFor(origin, true); key = keys.get(header.kid); } // unknown kid: refetch once
  if (!key) throw new AttestationError(`No attestation key for kid ${header.kid}`);

  const ok = await webcrypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key,
    b64urlToBuf(s), Buffer.from(`${h}.${p}`, "ascii"));
  if (!ok) throw new AttestationError("Attestation signature invalid");
  return JSON.parse(b64urlToBuf(p).toString()) as Claims;
}

/**
 * Throw unless `jws` is a valid gateway attestation for this 402: correct issuer,
 * unexpired, same session, the exact PAYMENT-REQUIRED bytes, and the payTo/network
 * we are about to pay. Call before signing anything.
 */
export async function verifyAttestation(input: {
  origin: string;
  prHeader: string;             // raw base64url PAYMENT-REQUIRED header, exactly as received
  sessionId: string;
  jws: string | null;
  accept: { payTo?: string; network?: string };
  now?: number;
}): Promise<void> {
  const now = Math.floor((input.now ?? Date.now()) / 1000);
  if (!input.jws) throw new AttestationError("402 carried no X-Payment-Required-Signature");

  const c = await verifiedClaims(input.origin, input.jws);
  if (c.iss !== input.origin) throw new AttestationError(`Attestation issuer ${c.iss} != ${input.origin}`);
  if (c.exp <= now - 60) throw new AttestationError("Attestation expired");
  if (c.iat > now + 60) throw new AttestationError("Attestation issued in the future");
  if (!input.sessionId || c.sid !== input.sessionId) throw new AttestationError("Attestation session mismatch");

  const prSha = createHash("sha256").update(input.prHeader, "ascii").digest("base64url");
  if (c.pr_sha256 !== prSha) throw new AttestationError("PAYMENT-REQUIRED was altered in transit (hash mismatch)");

  if ((input.accept.payTo ?? "").toLowerCase() !== c.pay_to.toLowerCase()) throw new AttestationError("payTo does not match the signed attestation");
  if ((input.accept.network ?? "") !== c.network) throw new AttestationError("network does not match the signed attestation");
}
