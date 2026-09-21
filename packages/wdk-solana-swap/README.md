# @clawdrop/wdk-swap-solana

A [WDK](https://docs.wallet.tether.io) community module that adds Jupiter-powered token swaps on Solana to any WDK-compatible wallet.

Implements WDK's `SwapProtocol` interface — drop it into any `WalletManager` setup without modifying your wallet code.

---

## Features

- Swap any SPL token pair via [Jupiter](https://jup.ag) aggregator (best-price routing across all Solana DEXs)
- `ExactIn` mode — sell an exact amount; `ExactOut` mode — buy an exact amount
- Configurable slippage, RPC endpoint, and max-fee guard
- Fully compatible with the WDK Manager pattern and `@tetherto/wdk-wallet` account interfaces
- Compatible with [Bare](https://github.com/holepunchto/bare) runtime (mobile / embedded environments)
- Works with autonomous AI agents — no UI required

---

## Installation

```bash
npm install @clawdrop/wdk-swap-solana
```

---

## Quick Start

### JavaScript

```javascript
import SolanaSwapProtocol from '@clawdrop/wdk-swap-solana'
import WalletManagerSolana from '@tetherto/wdk-wallet-solana'

const SOL  = 'So11111111111111111111111111111111111111112'
const USDT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'

const wallet  = new WalletManagerSolana('your twelve word mnemonic here ...')
const account = await wallet.getAccount(0)

const swapper = new SolanaSwapProtocol(account, {
  rpcUrl:      'https://mainnet.helius-rpc.com/?api-key=YOUR_KEY',
  slippageBps: 50  // 0.5%
})

// Quote without executing
const quote = await swapper.quoteSwap({
  tokenIn:       SOL,
  tokenOut:      USDT,
  tokenInAmount: 1_000_000_000n  // 1 SOL (9 decimals)
})
console.log(`Estimated out: ${quote.tokenOutAmount} USDT base units`)
console.log(`Platform fee:  ${quote.fee} lamports`)

// Execute swap
const result = await swapper.swap({
  tokenIn:       SOL,
  tokenOut:      USDT,
  tokenInAmount: 1_000_000_000n
})
console.log(`Swapped! Tx: https://solscan.io/tx/${result.hash}`)
```

### TypeScript

```typescript
import SolanaSwapProtocol, { SolanaSwapProtocolConfig, SwapOptions, SwapResult } from '@clawdrop/wdk-swap-solana'
import type { IWalletAccount } from '@tetherto/wdk-wallet'

const config: SolanaSwapProtocolConfig = {
  rpcUrl:      'https://mainnet.helius-rpc.com/?api-key=YOUR_KEY',
  slippageBps: 50,
  swapMaxFee:  10_000n  // refuse swap if platform fee > 10k lamports
}

async function doSwap(account: IWalletAccount): Promise<SwapResult> {
  const swapper = new SolanaSwapProtocol(account, config)
  return swapper.swap({
    tokenIn:       'So11111111111111111111111111111111111111112',
    tokenOut:      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    tokenInAmount: 1_000_000_000n
  })
}
```

---

## Usage Examples

### ExactOut: Buy a specific amount

```javascript
const result = await swapper.swap({
  tokenIn:        SOL,
  tokenOut:       USDT,
  tokenOutAmount: 100_000_000n  // buy exactly 100 USDT (6 decimals)
})
```

### Send output to a different address

```javascript
const result = await swapper.swap({
  tokenIn:       SOL,
  tokenOut:      USDT,
  tokenInAmount: 1_000_000_000n,
  to:            'RECIPIENT_TOKEN_ACCOUNT_ADDRESS'
})
```

### Max-fee guard for autonomous agents

Useful when running in an unattended loop — prevents overpaying platform fees.

```javascript
const swapper = new SolanaSwapProtocol(account, {
  swapMaxFee: 10_000n  // throws if Jupiter platform fee exceeds 10k lamports
})

try {
  await swapper.swap({ tokenIn: SOL, tokenOut: USDT, tokenInAmount: 1_000_000_000n })
} catch (err) {
  if (err.message.includes('exceeds swapMaxFee')) {
    console.log('Fee too high — skipping swap')
  }
}
```

### Quote before swap (recommended)

Always quote first to check the price and fee before committing.

```javascript
const quote = await swapper.quoteSwap({ tokenIn: SOL, tokenOut: USDT, tokenInAmount: 1_000_000_000n })

if (quote.fee > MAX_ACCEPTABLE_FEE) {
  throw new Error(`Fee too high: ${quote.fee}`)
}

const result = await swapper.swap({ tokenIn: SOL, tokenOut: USDT, tokenInAmount: 1_000_000_000n })
```

---

## API Reference

### `new SolanaSwapProtocol(account, config?)`

Creates a new swap protocol instance.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `account` | `IWalletAccount` | — | WDK wallet account with signing capability |
| `config.rpcUrl` | `string` | mainnet-beta public RPC | Solana RPC endpoint URL |
| `config.slippageBps` | `number` | `50` | Slippage tolerance in basis points (50 = 0.5%) |
| `config.swapMaxFee` | `number \| bigint` | none | Max platform fee in lamports — throws `Error` if exceeded |

---

### `quoteSwap(options)`

Fetches a price quote from Jupiter without executing any transaction. No SOL or tokens are spent.

```typescript
quoteSwap(options: SwapOptions): Promise<Omit<SwapResult, 'hash'>>
```

**Returns:**

| Field | Type | Description |
|-------|------|-------------|
| `tokenInAmount` | `bigint` | Actual amount sold (atomic units) |
| `tokenOutAmount` | `bigint` | Estimated amount received (atomic units) |
| `fee` | `bigint` | Jupiter platform fee in lamports |

---

### `swap(options)`

Executes the swap: quotes, fetches the Jupiter transaction, signs with the WDK account, and broadcasts to Solana mainnet.

```typescript
swap(options: SwapOptions): Promise<SwapResult>
```

**`SwapOptions`:**

| Field | Type | Description |
|-------|------|-------------|
| `tokenIn` | `string` | Mint address of the token to sell |
| `tokenOut` | `string` | Mint address of the token to buy |
| `tokenInAmount` | `bigint` | Exact amount to sell — use for `ExactIn` mode |
| `tokenOutAmount` | `bigint` | Exact amount to buy — use for `ExactOut` mode |
| `to` | `string?` | Optional recipient token account (defaults to signer's ATA) |

Either `tokenInAmount` or `tokenOutAmount` must be set, not both.

**`SwapResult`:**

| Field | Type | Description |
|-------|------|-------------|
| `hash` | `string` | Confirmed Solana transaction signature |
| `tokenInAmount` | `bigint` | Actual amount sold |
| `tokenOutAmount` | `bigint` | Actual amount received |
| `fee` | `bigint` | Platform fee charged |

---

## Common Token Addresses

| Token | Mint Address |
|-------|-------------|
| SOL (wrapped) | `So11111111111111111111111111111111111111112` |
| USDT | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` |
| USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |

Full token list: [Jupiter Token List](https://token.jup.ag/all)

---

## WDK Architecture

This module extends WDK's `SwapProtocol` base class and follows the WDK Manager pattern. It requires an `IWalletAccount` with signing capability (`keyPair.privateKey`).

```
WalletManager
  └── IWalletAccount
        └── SolanaSwapProtocol  ← this module
              └── Jupiter API v6
```

The module does not modify WDK core — it is a standalone protocol plugin.

---

## Bare Runtime

This module exports a Bare-compatible entry point for mobile and embedded environments:

```javascript
// In a Bare environment
import SolanaSwapProtocol from '@clawdrop/wdk-swap-solana/bare'
```

The `bare.js` entry wraps the module with `bare-node-runtime` global polyfills and import maps.

---

## Development

```bash
npm install
npm test        # runs test suite with brittle (TAP output)
npm run lint    # StandardJS linting
```

Tests use [brittle](https://github.com/holepunchto/brittle) and run against the real `@solana/web3.js` with a generated test keypair. Jupiter API calls are mocked via `global.fetch`.

---

## License

Apache-2.0 — Clawdrop / HFSP Labs, 2026
