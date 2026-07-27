# Examples

These examples show how to extend and integrate the WDK Multi-Chain Wallet starter.

## What's here

| File | What it demonstrates |
|------|---------------------|
| [dapp-integration/](dapp-integration/) | Inject `window.wdkWallet` so web pages can request address, sign, and send |
| [custom-network/](custom-network/) | Add a new EVM network (Base) in ~20 lines |
| [custom-token/](custom-token/) | Display a custom ERC-20 / SPL token balance |

---

## Quick concepts

### How the extension works internally

```
Web Page (dApp)
    │  window.postMessage / chrome.runtime
    ▼
Content Script (bridge)        ← you add this for dApp integration
    │  chrome.runtime.sendMessage
    ▼
Service Worker (service-worker.js)    ← all wallet logic lives here
    │
    ├─ @tetherto/wdk-wallet-solana
    ├─ @tetherto/wdk-wallet-evm
    ├─ @tetherto/wdk-wallet-btc
    └─ @tetherto/wdk-wallet-spark
```

### Message protocol

All communication is JSON via `chrome.runtime.sendMessage`:

```js
// From popup or content script:
chrome.runtime.sendMessage({ type: 'WALLET_BALANCE' }, (response) => {
  if (response.error) throw new Error(response.error)
  const { native, nativeSymbol, usdt } = response.data
})
```

Full protocol reference: [../README.md#message-protocol](../README.md#message-protocol)
