# @clawdrop/wdk-browser-extension

> Multi-chain browser extension wallet starter — Chrome & Brave (Manifest V3)  
> Built with [Tether WDK](https://docs.wdk.tether.io) · Solana · Ethereum · Polygon · Arbitrum · Plasma · Bitcoin · Lightning

[![WDK](https://img.shields.io/badge/tether-wdk-green)](https://docs.wdk.tether.io)
[![MV3](https://img.shields.io/badge/chrome-mv3-blue)](https://developer.chrome.com/docs/extensions/mv3)
[![License](https://img.shields.io/badge/license-Apache--2.0-orange)](LICENSE)

## What This Is

A **production-quality browser extension starter** that demonstrates how to use Tether WDK to build a non-custodial multi-chain wallet. Fork it to build your own wallet product.

**End-to-end capabilities:**
- Create or import wallet via BIP-39 seed phrase
- Derive accounts for 7 networks from a single mnemonic
- Check native token + USDt balances
- Send tokens (USDt and native)
- Sign arbitrary messages (EIP-191 on EVM, Ed25519 on Solana)
- Password-encrypted storage with AES-GCM (PBKDF2 200k iterations)

---

## Networks Supported

| Network | Symbol | USDt | WDK Package |
|---------|--------|------|-------------|
| Solana | SOL | ✅ | `@tetherto/wdk-wallet-solana` |
| Ethereum | ETH | ✅ | `@tetherto/wdk-wallet-evm` |
| Polygon | POL | ✅ | `@tetherto/wdk-wallet-evm` |
| Arbitrum | ETH | ✅ | `@tetherto/wdk-wallet-evm` |
| Plasma | ETH | ✅ | `@tetherto/wdk-wallet-evm` |
| Bitcoin | BTC | — | `@tetherto/wdk-wallet-btc` |
| Lightning (Spark) | BTC | — | `@tetherto/wdk-wallet-spark` |

> One seed phrase controls all accounts. EVM chains (Ethereum, Polygon, Arbitrum, Plasma) share the same address.

---

## Quick Start

### Install

```bash
npm install
```

### Build

```bash
npm run build
```

### Load in Chrome or Brave

1. Open `chrome://extensions` (or `brave://extensions`)
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `dist/` folder

The wallet icon appears in your browser toolbar.

### Development (watch mode)

```bash
npm run dev
```

Vite rebuilds on file save. Reload the extension manually after each rebuild.

---

## Architecture

```
src/
├── background/
│   └── service-worker.js   ← All wallet logic (MV3 service worker)
├── popup/
│   ├── index.html          ← Extension popup UI
│   ├── app.js              ← Popup state machine (vanilla JS)
│   └── styles.css          ← UI styles
└── keystore.js             ← AES-GCM encrypt/decrypt (Web Crypto API)
```

### Message Protocol

The popup communicates with the service worker via `chrome.runtime.sendMessage`:

```js
// All messages: { type, ...payload } → { data } or { error }

WALLET_STATE   → {}                          → { initialized, unlocked, address, networkId }
WALLET_CREATE  → { password }               → { mnemonic, address }
WALLET_IMPORT  → { mnemonic, password }     → { address }
WALLET_UNLOCK  → { password }               → { address, networkId }
WALLET_LOCK    → {}                          → { ok }
WALLET_BALANCE → {}                          → { native, nativeSymbol, usdt, usdtSymbol }
WALLET_SEND    → { to, amount, asset }      → { hash }
WALLET_SIGN    → { message }               → { signature, address, network }
NETWORK_GET    → {}                          → { networkId, network }
NETWORK_SET    → { networkId }             → { address }
RPC_SET        → { networkId, rpcUrl }     → { ok }
```

### WDK Integration

Each network type maps to a WDK wallet class:

```js
// Solana
const manager = new WalletManagerSolana(mnemonic, { provider: rpcUrl })

// EVM (Ethereum, Polygon, Arbitrum, Plasma)
const manager = new WalletManagerEvm(mnemonic, { provider: rpcUrl })

// Bitcoin (WebSocket Electrum — required for browser)
const manager = new WalletManagerBtc(mnemonic, {
  client: { type: 'electrum-ws', clientConfig: { url: 'wss://electrum.blockstream.info:50004' } },
  network: 'bitcoin'
})

// Lightning (Spark)
const manager = new WalletManagerSpark(mnemonic, { network: 'MAINNET' })

// All share the same interface:
const account = await manager.getAccount(0)          // account index
const address = await account.getAddress()
const balance = await account.getBalance()           // native token (lamports / wei / sats)
const tokenBal = await account.getTokenBalance(addr) // SPL / ERC-20
const sig = await account.sign(message)              // message signing
await account.transfer({ token, recipient, amount }) // send tokens
```

### Key Derivation & Security

```
Seed phrase (BIP-39, 12 words)
    │
    ├─ Solana  → SLIP-0010 / Ed25519  m/44'/501'/0'/0'
    ├─ EVM     → BIP-44 / secp256k1   m/44'/60'/0'/0/0
    └─ Bitcoin → BIP-84 / secp256k1   m/84'/0'/0'/0/0
```

**Storage:** The seed phrase is never stored in plaintext. Encrypted with:
- Key derivation: PBKDF2, SHA-256, 200,000 iterations, random 16-byte salt
- Encryption: AES-GCM, 256-bit key, random 12-byte IV
- Storage: `chrome.storage.local` (encrypted blob only)

**Session:** Decrypted mnemonic lives in service worker memory only while unlocked. Lost when the service worker sleeps (Chrome kills it after ~30 seconds of inactivity), requiring re-unlock.

---

## Extending This Starter

### Add a new EVM network

Add an entry to `NETWORKS` in `service-worker.js`:

```js
base: {
  id: 'base', name: 'Base', symbol: 'ETH', nativeDecimals: 18,
  usdt: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', usdtDecimals: 6,
  defaultRpc: 'https://mainnet.base.org',
  type: 'evm'
}
```

Then add a pill in `index.html`:

```html
<button class="net-pill" data-network="base">BASE</button>
```

And register it in `NET_META` in `app.js`:

```js
base: { name: 'Base', symbol: 'ETH', hasUsdt: true, type: 'evm' }
```

### Add a custom RPC per network

The extension Settings tab lets users override the RPC per network. Programmatically:

```js
await chrome.runtime.sendMessage({ type: 'RPC_SET', networkId: 'solana', rpcUrl: 'https://my-rpc.com' })
```

### Use multiple accounts

The service worker exposes `getAccount(index)` internally. To add account switching, send the desired index:

```js
// Extend the protocol:
WALLET_ACCOUNT_SET → { index } → { address }
```

---

## WDK Packages Used

| Package | Version | Purpose |
|---------|---------|---------|
| `@tetherto/wdk-wallet` | ^1.0.0-beta | BIP-39 seed phrase utils |
| `@tetherto/wdk-wallet-solana` | ^1.0.0-beta | Solana accounts |
| `@tetherto/wdk-wallet-evm` | ^1.0.0-beta | EVM accounts (ETH/Polygon/Arbitrum) |
| `@tetherto/wdk-wallet-btc` | ^1.0.0-beta | Bitcoin accounts |
| `@tetherto/wdk-wallet-spark` | ^1.0.0-beta | Lightning (Spark) accounts |

Full WDK documentation: [docs.wdk.tether.io](https://docs.wdk.tether.io)

---

## Known Limitations

- **Bitcoin TCP Electrum** — raw TCP is not available in browsers. This starter uses WebSocket Electrum (`wss://electrum.blockstream.info:50004`). For production, run your own Electrum server.
- **Plasma RPC** — `https://rpc.plasma.finance` is the configured endpoint. Verify the current Plasma mainnet RPC before production use.
- **Large bundle** — all 7 chain SDKs are bundled together (~8MB). For production, consider lazy-loading per-network bundles via dynamic `import()`.
- **Service worker sleep** — Chrome kills the MV3 service worker after inactivity. Users must re-unlock. Use `chrome.storage.session` (Chrome 102+) to persist the session across service worker restarts within the same browser session.

---

## License

Apache-2.0
