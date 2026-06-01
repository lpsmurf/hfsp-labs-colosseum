# @clawdrop/wdk-swap-solana

A [WDK](https://docs.wdk.tether.io) community module that enables Jupiter-powered token swaps on Solana for any WDK-compatible wallet.

Built by [Clawdrop](https://clawdrop.live) — autonomous Solana AI agents.

---

## Features

- Swap any SPL token pair via [Jupiter](https://jup.ag) aggregator (best price routing across all Solana DEXs)
- Supports `ExactIn` (sell exact amount) and `ExactOut` (buy exact amount) swap modes
- Configurable slippage, RPC endpoint, and max fee guard
- Fully compatible with `@tetherto/wdk-wallet-solana` accounts
- Works with autonomous AI agents — no UI required

---

## Installation

```bash
npm install @clawdrop/wdk-swap-solana
```

---

## Usage

### Basic: Swap SOL → USDT

```javascript
import SolanaSwapProtocol from '@clawdrop/wdk-swap-solana'
import WalletManagerSolana from '@tetherto/wdk-wallet-solana'

const SOL  = 'So11111111111111111111111111111111111111112'
const USDT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'

const wallet = new WalletManagerSolana('your twelve word mnemonic here ...')
const account = await wallet.getAccount(0)

const swapper = new SolanaSwapProtocol(account, {
  rpcUrl: 'https://mainnet.helius-rpc.com/?api-key=YOUR_KEY',
  slippageBps: 50 // 0.5%
})

// Quote first (no transaction)
const quote = await swapper.quoteSwap({
  tokenIn: SOL,
  tokenOut: USDT,
  tokenInAmount: 1_000_000_000n // 1 SOL in lamports
})
console.log(`Estimated out: ${quote.tokenOutAmount} USDT base units`)

// Execute
const result = await swapper.swap({
  tokenIn: SOL,
  tokenOut: USDT,
  tokenInAmount: 1_000_000_000n
})
console.log(`Swapped! Tx: https://solscan.io/tx/${result.hash}`)
```

### ExactOut: Buy a specific amount of USDT

```javascript
const result = await swapper.swap({
  tokenIn: SOL,
  tokenOut: USDT,
  tokenOutAmount: 100_000_000n // buy exactly 100 USDT (6 decimals)
})
```

### Send output to a different address

```javascript
const result = await swapper.swap({
  tokenIn: SOL,
  tokenOut: USDT,
  tokenInAmount: 1_000_000_000n,
  to: 'RECIPIENT_WALLET_ADDRESS'
})
```

### Max fee guard (for autonomous agents)

```javascript
const swapper = new SolanaSwapProtocol(account, {
  swapMaxFee: 10_000n // refuse swap if platform fee exceeds 10k lamports
})
```

---

## API

### `new SolanaSwapProtocol(account, config?)`

| Parameter | Type | Description |
|---|---|---|
| `account` | `IWalletAccount` | WDK wallet account with signing capability |
| `config.rpcUrl` | `string` | Solana RPC URL (default: public mainnet-beta) |
| `config.slippageBps` | `number` | Slippage in basis points (default: `50` = 0.5%) |
| `config.swapMaxFee` | `number \| bigint` | Max platform fee in lamports — throws if exceeded |

### `quoteSwap(options): Promise<{ fee, tokenInAmount, tokenOutAmount }>`

Returns a price quote without executing any transaction.

### `swap(options): Promise<{ hash, fee, tokenInAmount, tokenOutAmount }>`

Executes the swap and returns the confirmed transaction hash.

**`options`:**

| Field | Type | Description |
|---|---|---|
| `tokenIn` | `string` | Mint address of the token to sell |
| `tokenOut` | `string` | Mint address of the token to buy |
| `tokenInAmount` | `bigint` | Exact amount to sell (ExactIn mode) |
| `tokenOutAmount` | `bigint` | Exact amount to buy (ExactOut mode) |
| `to` | `string?` | Optional recipient address (defaults to account) |

_Either `tokenInAmount` or `tokenOutAmount` must be set, not both._

---

## Common Token Addresses

| Token | Mint Address |
|---|---|
| SOL (wrapped) | `So11111111111111111111111111111111111111112` |
| USDT | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` |
| USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |

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
