# Displaying a Custom Token Balance

## ERC-20 on EVM (e.g. USDC on Ethereum)

In `handleWalletBalance` in service-worker.js, after the native balance:

```js
// USDC on Ethereum: 6 decimals
const USDC_ETH = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const usdcUnits = await sess.account.getTokenBalance(USDC_ETH)
const usdc = Number(usdcUnits) / 1e6
// Return it alongside native + usdt
return { native, nativeSymbol, usdt, usdc: usdc.toFixed(6) }
```

## SPL Token on Solana (e.g. BONK)

```js
const BONK_MINT = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'
const bonkUnits = await sess.account.getTokenBalance(BONK_MINT)
const bonk = Number(bonkUnits) / 1e5 // BONK has 5 decimals
```

The WDK `getTokenBalance(mintOrContractAddress)` works identically across
Solana (SPL) and EVM (ERC-20) — just pass the token address.
