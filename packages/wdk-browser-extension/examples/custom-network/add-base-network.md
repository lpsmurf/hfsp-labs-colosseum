# Adding a Custom EVM Network (Base)

This shows how to add Coinbase's Base network in ~20 lines across 3 files.

## 1. service-worker.js — add to NETWORKS

```js
base: {
  id: 'base', name: 'Base', symbol: 'ETH', nativeDecimals: 18,
  usdt: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', usdtDecimals: 6,
  defaultRpc: 'https://mainnet.base.org',
  type: 'evm'
}
```

## 2. index.html — add pill to the network bar

```html
<button class="net-pill" data-network="base">BASE</button>
```

## 3. app.js — add to NET_META

```js
base: { name: 'Base', symbol: 'ETH', hasUsdt: true, type: 'evm' }
```

That's it. The wallet derives the same EVM address (BIP-44 m/44'/60') and
connects to the Base RPC. USDt on Base uses the contract address above.
