# VPN x402 — Pay Skills (Base)

Anonymous WireGuard VPN passes and ephemeral Ubuntu VPS servers.
Pay USDC on Base mainnet via the x402 protocol. One HTTP call. Works headless — no browser, no account.

**Base URL:** `https://vpn-base.hfsp.cloud`
**Discovery:** `GET /.well-known/x402.json`

---

## How it works (agent flow)

```
1. POST /api/vpn/week  { region, clientWgPublicKey }
2. ← 402 Payment Required  { amount: 2990000, asset: USDC, network: base }
3. Agent signs and submits a Base USDC transfer, adds X-PAYMENT header, retries
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
| `POST /api/vps/day`  | $0.99 USDC | 24 hours |
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

`ssh -i key.pem root@<ip>` — server ready in ~60s.

---

## Privacy

- Server SSH keypairs generated in memory at provisioning time, never stored
- VPN servers: SSH port closed, no operator access
- VPS servers: only client-generated SSH public key in `authorized_keys`
- No logs of IPs, payment amounts, or provisioning details
- Servers auto-destroyed at `expiresAt` by cron

## Payment

- **Network:** Base mainnet (`eip155:8453`)
- **Asset:** USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, 6 decimals)
- **Recipient:** `0xaF4991538332E3A037EF457BC635f0757ad61149`
- **Protocol:** x402 — send EVM USDC, retry with `X-PAYMENT: <signed-payload>` header
- **Verification:** x402.org facilitator verifies on-chain (`https://x402.org/facilitator`)
- **Testnet:** Base Sepolia supported when `DEV_MODE=true` (USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`)

## Regions

| ID | Location |
|----|----------|
| `DE_NBG` | Nuremberg, Germany (EU) |
| `FI_HEL` | Helsinki, Finland (EU) |
| `US_HIL` | Hillsboro, Oregon, USA |
| `SG_SIN` | Singapore (APAC) |
