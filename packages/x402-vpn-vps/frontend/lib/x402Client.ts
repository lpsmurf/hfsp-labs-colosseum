// x402Client — headless-first API client.
// Each function maps to a single POST that the x402 middleware gates.
// PayButton handles the 402 → pay → retry cycle automatically.
// AI agents can call these endpoints directly without any browser.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface ApiResponse<T> {
  ok:        boolean;
  data?:     T;
  error?:    string;
  code?:     string;
  expiresAt: string | null;
}

async function post<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
  const res = await fetch(`${API_URL}${path}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  return res.json() as Promise<ApiResponse<T>>;
}

export type VpnPeriod = "hour" | "day" | "week" | "month";
export type VpsPeriod = "hour" | "day" | "week";
export type Region    = "DE_NBG" | "FI_HEL" | "US_HIL" | "SG_SIN";

// ── VPN ──────────────────────────────────────────────────────────────────────
// Single call: x402 middleware handles 402 → payment → verify before reaching handler.
// Returns server IP + server WG public key. Client builds the full .conf locally.

export async function vpnClaim(params: {
  region:            Region;
  period:            VpnPeriod;
  clientWgPublicKey: string; // base64 X25519 — generated in browser, never stored
}) {
  return post<{ ip: string; serverWgPubKey: string }>(`/api/vpn/${params.period}`, {
    region:            params.region,
    clientWgPublicKey: params.clientWgPublicKey,
  });
}

// ── VPS ──────────────────────────────────────────────────────────────────────
// SSH private key generated in browser — only public key sent here.

export async function vpsClaim(params: {
  region:       Region;
  period:       VpsPeriod;
  sshPublicKey: string; // OpenSSH Ed25519 — operator never sees private key
}) {
  return post<{ ip: string; wireguardClientConf: string }>(`/api/vps/${params.period}`, {
    region:       params.region,
    sshPublicKey: params.sshPublicKey,
  });
}
