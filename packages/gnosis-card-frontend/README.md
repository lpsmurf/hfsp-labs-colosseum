# @clawdrop/gnosis-card-frontend

Human-facing frontend for [gnosis-card-x402](../gnosis-card-x402). Lets a person top up their Gnosis Pay Safe with USDC from **Solana (Phantom)** or **Base (MetaMask)** — funds bridge to Gnosis Chain in ~90 seconds.

> The backend's x402 gate only needs an `X-Payment` tx signature. Agents produce that programmatically; this frontend produces it by having a human connect a wallet and sign the USDC transfer in the browser. **No backend changes required.**

---

## Two tabs

| Tab | Status | What it does |
|-----|--------|--------------|
| **Top Up** | ✅ Live | Quote → connect wallet → pay USDC → submit proof → poll bridge → done. Hits the real API. |
| **Get a Card** | 🎨 Preview mockup | Visual prototype of the managed onboarding flow (SIWE → fee → terms → KYC → Safe → card). No logic wired — for design review / future build. |

---

## Run locally

```bash
npm install
cp .env.example .env      # optional — defaults work with the dev proxy
npm run dev               # → http://localhost:5174
```

The dev server proxies `/api/*` to the backend (default `http://localhost:3001`), so run the [gnosis-card-x402](../gnosis-card-x402) server alongside it:

```bash
cd ../gnosis-card-x402 && npm start   # → http://localhost:3001
```

### Build for production

```bash
npm run build            # → dist/
```

Set `VITE_API_BASE` to the deployed backend origin when the frontend and API are on different hosts.

---

## Top-up flow

```
┌─ Details ──┐   ┌─ Quote ──┐   ┌─ Pay ───────┐   ┌─ Bridge ──┐   ┌─ Done ─┐
│ amount     │ → │ fees +   │ → │ connect     │ → │ poll      │ → │ funds  │
│ Safe addr  │   │ ETA      │   │ wallet,     │   │ /topup/   │   │ in     │
│ currency   │   │          │   │ send USDC,  │   │ :orderId  │   │ Safe   │
│ chain      │   │          │   │ X-Payment   │   │           │   │        │
└────────────┘   └──────────┘   └─────────────┘   └───────────┘   └────────┘
   form            getQuote()      wallet +          getOrderStatus()
                                   submitTopup()
```

### Wallet integration

- **Solana** ([src/wallets/solana.js](src/wallets/solana.js)) — Phantom via `window.phantom.solana`. Builds an SPL `transferChecked` to the service wallet's USDC ATA (idempotent ATA-create included), Phantom signs + broadcasts.
- **Base** ([src/wallets/evm.js](src/wallets/evm.js)) — MetaMask via `window.ethereum`. Switches to Base (chain `0x2105`), encodes the ERC-20 `transfer` calldata directly (no ABI lib), sends via `eth_sendTransaction`.

The resulting signature/hash is sent as the `X-Payment` header to `POST /api/card/topup`.

---

## Project layout

```
src/
├── main.jsx                 React entry
├── App.jsx                  Tab shell (Top Up / Get a Card)
├── config.js                Mints, chain IDs, currencies
├── api.js                   Backend client (quote / submit / poll)
├── wallets/
│   ├── solana.js            Phantom connect + USDC SPL transfer
│   └── evm.js               MetaMask connect + USDC transfer on Base
└── components/
    ├── TopUp.jsx            ✅ Live top-up flow
    └── Onboard.jsx          🎨 Onboarding mockup (no logic)
```

---

## Notes

- **Solana RPC** — the browser needs an RPC to fetch a recent blockhash before Phantom broadcasts. Default is the public mainnet endpoint; set `VITE_SOLANA_RPC` to a Helius/QuickNode URL for reliability.
- **Recipient ATA** — the service wallet already holds USDC, so its ATA exists; the idempotent create instruction is a safety net only.
- **Onboarding** — when ready to build for real, wire `components/Onboard.jsx` to the `/api/card/onboard/*` endpoints and add `@sumsub/websdk-react` for the KYC widget.

---

## License

Apache-2.0 © Clawdrop · [info@hfsp.xyz](mailto:info@hfsp.xyz)
