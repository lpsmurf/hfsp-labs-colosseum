# @clawdrop/wdk-browser-extension-solana

A Solana browser extension wallet built on **Tether WDK** — Chrome/Brave, Manifest V3.

Send and receive **USDt on Solana** directly from your browser. Keys are encrypted with AES-GCM and stored in `chrome.storage.local`. The wallet logic runs in the extension's background service worker, isolated from any web page.

---

## Features

- **Create or import** a 12-word BIP-39 seed phrase
- **AES-GCM encrypted storage** — password-derived via PBKDF2 (200k iterations)
- **WDK wallet** — key derivation via SLIP-0010, `@tetherto/wdk-wallet-solana`
- **SOL + USDt balances** — live from Solana mainnet
- **Send USDt** — SPL token transfers via WDK `account.transfer()`
- **Receive** — copy your Solana address
- **Configurable RPC** — use your own Helius/QuickNode endpoint
- **Lock / unlock** — session kept in service worker memory; cleared on lock or browser restart
- **MV3 service worker** — `type: module`, fully ESM, minimal permissions (`storage` only)

---

## Architecture

```
src/
├── background/service-worker.js   ← WDK wallet + message dispatcher
├── popup/
│   ├── index.html                 ← 5-view single-page popup
│   ├── app.js                     ← vanilla JS state machine
│   └── styles.css
└── keystore.js                    ← Web Crypto AES-GCM encrypt/decrypt
```

**Message protocol** (popup → service worker):

| Type | Payload | Response |
|------|---------|----------|
| `WALLET_STATE` | — | `{ initialized, unlocked, address }` |
| `WALLET_CREATE` | `{ password }` | `{ mnemonic, address }` |
| `WALLET_IMPORT` | `{ mnemonic, password }` | `{ address }` |
| `WALLET_UNLOCK` | `{ password }` | `{ address }` |
| `WALLET_LOCK` | — | `{ ok }` |
| `WALLET_BALANCE` | — | `{ sol, usdt }` |
| `WALLET_SEND` | `{ to, amount }` | `{ hash }` |
| `RPC_SET` | `{ rpcUrl }` | `{ ok }` |

---

## Build & Install

```bash
npm install
npm run build        # outputs to dist/
npm run gen:icons    # regenerates icons in public/icons/ (already included)
```

**Load in Chrome/Brave:**

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist/` folder

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `@tetherto/wdk-wallet-solana` | BIP-39 key derivation, SLIP-0010, SPL token transfers |
| `vite` | Build bundler |
| `vite-plugin-node-polyfills` | `Buffer` / `process` polyfills for browser context |

The WDK package uses `sodium-universal` (libsodium) for secure memory zeroing of private keys (`sodium_memzero`). In browser, it automatically uses the pure-JS libsodium implementation.

---

## USDt Token Address

`Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` — Tether USD on Solana mainnet.

---

## License

Apache-2.0 © Clawdrop <info@hfsp.xyz>
