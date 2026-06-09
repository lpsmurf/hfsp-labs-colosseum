# @clawdrop/wdk-swap-tron

A [WDK](https://docs.wdk.tether.io) community module that enables SunSwap-powered token swaps on Tron for any WDK-compatible wallet.

Built by [Clawdrop](https://clawdrop.live) — autonomous Solana AI agents, now multichain.

---

## Features

- Swap any TRC-20 token pair via [SunSwap V2](https://sun.io) (the largest DEX on Tron by volume)
- Best-route selection via SunSwap's aggregation router API
- Configurable slippage, full node endpoint, and max fee guard
- Fully compatible with `@tetherto/wdk-wallet-tron` accounts
- Works with autonomous AI agents — no UI required

---

## Installation

```bash
npm install @clawdrop/wdk-swap-tron
```

---

## Usage

### Basic: Swap TRX → USDT

```javascript
import TronSwapProtocol from '@clawdrop/wdk-swap-tron'
import WalletManagerTron from '@tetherto/wdk-wallet-tron'

const TRX  = 'TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR'  // wrapped TRX on SunSwap
const USDT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'  // USDT-TRC20

const wallet = new WalletManagerTron('your twelve word mnemonic here ...')
const account = await wallet.getAccount(0)

const swapper = new TronSwapProtocol(account, {
  fullHost: 'https://api.trongrid.io',
  slippageBps: 50 // 0.5%
})

// Quote first (no transaction)
const quote = await swapper.quoteSwap({
  tokenIn: TRX,
  tokenOut: USDT,
  tokenInAmount: 1_000_000n // 1 TRX (6 decimals = 1,000,000 SUN)
})
console.log(`Estimated out: ${quote.tokenOutAmount} USDT base units`)

// Execute
const result = await swapper.swap({
  tokenIn: TRX,
  tokenOut: USDT,
  tokenInAmount: 1_000_000n
})
console.log(`Swapped! Tx: https://tronscan.org/#/transaction/${result.hash}`)
```

### Send output to a different address

```javascript
const result = await swapper.swap({
  tokenIn: TRX,
  tokenOut: USDT,
  tokenInAmount: 1_000_000n,
  to: 'TRECIPIENT_ADDRESS'
})
```

### Max fee guard (for autonomous agents)

```javascript
const swapper = new TronSwapProtocol(account, {
  swapMaxFee: 500_000n // refuse swap if fee exceeds 0.5 TRX worth of SUN
})
```

### With TronGrid API key (higher rate limits)

```javascript
const swapper = new TronSwapProtocol(account, {
  fullHost: 'https://api.trongrid.io',
  tronGridApiKey: 'YOUR_TRONGRID_API_KEY'
})
```

---

## API

### `new TronSwapProtocol(account, config?)`

| Parameter | Type | Description |
|---|---|---|
| `account` | `IWalletAccount` | WDK wallet account with signing capability |
| `config.fullHost` | `string` | TronGrid full node URL (default: `https://api.trongrid.io`) |
| `config.tronGridApiKey` | `string` | Optional TronGrid API key for higher rate limits |
| `config.slippageBps` | `number` | Slippage in basis points (default: `50` = 0.5%) |
| `config.swapMaxFee` | `number \| bigint` | Max swap fee in SUN — throws if exceeded |

### `quoteSwap(options): Promise<{ fee, tokenInAmount, tokenOutAmount }>`

Returns a price quote without executing any transaction. All amounts are in the token's smallest unit (SUN for TRX, 10⁻⁶ for TRC-20 with 6 decimals).

### `swap(options): Promise<{ hash, fee, tokenInAmount, tokenOutAmount }>`

Executes the swap via SunSwap V2 and returns the confirmed transaction hash.

**`options`:**

| Field | Type | Description |
|---|---|---|
| `tokenIn` | `string` | TRC-20 contract address of the token to sell |
| `tokenOut` | `string` | TRC-20 contract address of the token to buy |
| `tokenInAmount` | `bigint` | Exact amount to sell in base units (ExactIn only) |
| `to` | `string?` | Optional recipient address (defaults to account) |

> **Note:** SunSwap router only supports ExactIn swaps. `tokenOutAmount` is not supported.

---

## Common Token Addresses (Tron Mainnet)

| Token | Address |
|---|---|
| TRX (wrapped, for SunSwap routing) | `TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR` |
| USDT (TRC-20) | `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` |
| USDC (TRC-20) | `TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8` |
| WBTC (TRC-20) | `TXpw8XeWYeTUd4quDskoUqeQPowRh4jY65` |
| SUN | `T98MnM9hg5RJEdz2MsWCNPCa9DjHxMC7LT` |

---

## Limitations

- **ExactIn only** — SunSwap router does not expose an ExactOut API.
- **V2 routes only** — Routes through SunSwap V3 pools will throw. V3 support is planned.
- Token approval (`approve()`) must be done separately before the first swap of a new token pair.

---

## Development

```bash
npm install
npm test
npm run lint
```

---

## License

Apache-2.0 — Clawdrop, 2026
