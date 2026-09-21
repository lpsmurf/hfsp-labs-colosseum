# x402-bunny-storage

Pay-per-upload object storage for AI agents. Agents pay USDC on Solana mainnet
via the [x402](https://x402.org) protocol; files are stored on
[Bunny.net Storage](https://docs.bunny.net/reference/bunnynet-api-overview) and
served from a Bunny CDN pull zone.

## Flow

1. `PUT /api/upload/{path}` with the file bytes as the request body.
2. No `X-Solana-Tx` header → `402` with the required USDC amount (priced by body
   size: `$PRICE_PER_MB_USDC`/MB, minimum `$MIN_PRICE_USDC`) and `payTo` address.
3. Send Solana mainnet USDC to `payTo`.
4. Resend the **identical** `PUT` (same path, same body) with
   `X-Solana-Tx: <signature>`.
5. On success, `201` with `{ ok: true, data: { url, path, sizeBytes } }` — `url`
   is the public CDN link.

Uploaded objects are namespaced under a server-generated random prefix so two
agents can never collide on the same path.

## Config

See `backend/.env.example`. Requires a Bunny.net Storage Zone + pull zone, a
Helius RPC key (payment verification), and Redis (replay protection).

## Run

```bash
cd backend
cp .env.example .env   # fill in values
npm install
npm run dev
```
