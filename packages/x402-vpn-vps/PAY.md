# VPN x402 — Pay Skills

Anonymous WireGuard VPN passes and ephemeral Ubuntu VPS servers.
Pay USDC on Solana via the x402 protocol. One HTTP call. Works headless — no browser, no account.

**Base URL:** `https://vpn.hfsp.cloud`
**Discovery:** `GET /.well-known/x402.json`

---

## How it works (agent flow)

```
1. POST /api/vpn/week  { region, clientWgPublicKey }
2. ← 402 Payment Required  { amount: 2990000, asset: USDC, network: solana }
3. Agent sends USDC on Solana mainnet, retries with X-Solana-Tx: <txSig>
4. ← 200  { ip, serverWgPubKey, expiresAt }
5. Agent builds WireGuard .conf from serverWgPubKey + own private key
```

No sessions. No accounts. No ZK proofs. One round-trip after payment.

---

## VPN — WireGuard

| Endpoint | Price | Duration |
|----------|-------|----------|
| `POST /api/vpn/hour`  | $0.20 USDC | 1 hour  |
| `POST /api/vpn/day`   | $0.79 USDC | 24 hours |
| `POST /api/vpn/week`  | $2.99 USDC | 7 days  |
| `POST /api/vpn/month` | $7.99 USDC | 30 days |

**Request body:**
```json
{
  "region": "DE_NBG",
  "clientWgPublicKey": "<base64 X25519 public key>"
}
```

**Regions:** `DE_NBG` · `FI_HEL` · `US_HIL` · `SG_SIN`

**Response:**
```json
{
  "ok": true,
  "data": {
    "ip": "1.2.3.4",
    "serverWgPubKey": "<base64>"
  },
  "expiresAt": "2024-01-15T12:00:00.000Z"
}
```

Build the WireGuard client config from `serverWgPubKey` + your own private key + `ip`.

---

## VPS — Ephemeral Ubuntu

| Endpoint | Price | Duration |
|----------|-------|----------|
| `POST /api/vps/hour` | $0.25 USDC | 1 hour  |
| `POST /api/vps/day`  | $0.79 USDC | 24 hours |
| `POST /api/vps/week` | $3.99 USDC | 7 days  |

**Request body:**
```json
{
  "region": "DE_NBG",
  "sshPublicKey": "ssh-ed25519 AAAA..."
}
```

Generate the SSH keypair client-side (Ed25519). Private key never leaves the client.

**Response:**
```json
{
  "ok": true,
  "data": {
    "ip": "5.6.7.8",
    "wireguardClientConf": "<base64 WireGuard config template>"
  },
  "expiresAt": "2024-01-15T12:00:00.000Z"
}
```

`ssh -i ~/.ssh/id_ed25519 root@<ip>` — server ready in ~60s.

---

## Privacy

- Server SSH keypairs generated in memory at provisioning time, never stored
- VPN servers: SSH port closed, no operator access
- VPS servers: only client-generated SSH public key in `authorized_keys`
- No logs of IPs, payment amounts, or provisioning details
- Servers auto-destroyed at `expiresAt` by cron

## Payment

- **Network:** Solana mainnet
- **Asset:** USDC (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`, 6 decimals)
- **Recipient:** `GdAWRcvrVabFi6QtciGJNYsS8cykJkZTNZ3cFea6ywfY`
- **Protocol:** Send a direct SPL token transfer, then retry with `X-Solana-Tx: <confirmed tx signature>`
- **Verification:** Server verifies on-chain via Helius RPC — no facilitator required
- **Replay protection:** Each tx signature is claimed atomically in Redis (one-time use)

## Agent discount

Agent wallets whitelisted by the operator pay a micro-transaction ($0.0001 USDC / 100 atomic units)
instead of the full tier price, for full real provisioning. Useful for CI and demos.
Contact `info@hfsp.xyz` to request agent wallet whitelisting.
