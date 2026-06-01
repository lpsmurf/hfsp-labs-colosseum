# @clawdrop/wdk-protocol-swap-wdk-swap-tron-tron

WDK module to make tron BIP-32 wallets interact with the wdk-swap-tron swap protocol.

## Installation

```bash
npm install @clawdrop/wdk-protocol-swap-wdk-swap-tron-tron
```

## Usage

```javascript
import WdkSwapTronProtocolTron from '@clawdrop/wdk-protocol-swap-wdk-swap-tron-tron'
import WalletManagerTron from '@tetherto/wdk-wallet-tron'

// Create wallet and get account
const wallet = new WalletManagerTron('your mnemonic...')
const account = await wallet.getAccount()

// Create swap protocol
const swapProtocol = new WdkSwapTronProtocolTron(account)

// Get a quote
const quote = await swapProtocol.quoteSwap({
  tokenIn: 'TOKEN_A_ADDRESS',
  tokenOut: 'TOKEN_B_ADDRESS',
  tokenInAmount: 1000000n // amount in base units
})

console.log('Quote:', quote)

// Execute swap
const result = await swapProtocol.swap({
  tokenIn: 'TOKEN_A_ADDRESS',
  tokenOut: 'TOKEN_B_ADDRESS',
  tokenInAmount: 1000000n
})

console.log('Swap result:', result)
```

## API Reference

### WdkSwapTronProtocolTron

#### Constructor

```javascript
new WdkSwapTronProtocolTron(account, config?)
```

- `account` - Wallet account (full or read-only)
- `config` - Optional configuration
  - `swapMaxFee` - Maximum allowed swap fee

#### Methods

- `swap(options)` - Execute a token swap
- `quoteSwap(options)` - Get a quote for a swap

## Development

```bash
npm install
npm test
npm run lint
```

## License

Apache-2.0
