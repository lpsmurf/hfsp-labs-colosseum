// MetaMask (or any injected EIP-1193 wallet) — connect + send a USDC transfer on Base.
import { BASE_CHAIN_ID_HEX, BASE_USDC } from '../config.js'

const USDC_DECIMALS = 6
const ERC20_TRANSFER_SELECTOR = '0xa9059cbb' // transfer(address,uint256)

function getProvider () {
  const provider = window.ethereum
  if (!provider) throw new Error('MetaMask not found. Install it from metamask.io')
  return provider
}

/** Connect MetaMask; returns the checksummed account address. */
export async function connectEvm () {
  const provider = getProvider()
  const accounts = await provider.request({ method: 'eth_requestAccounts' })
  if (!accounts?.length) throw new Error('No account authorized')
  return accounts[0]
}

/** Ensure the wallet is on Base mainnet, adding the chain if needed. */
async function ensureBaseChain (provider) {
  const current = await provider.request({ method: 'eth_chainId' })
  if (current === BASE_CHAIN_ID_HEX) return
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: BASE_CHAIN_ID_HEX }]
    })
  } catch (err) {
    // 4902 = chain not added yet
    if (err.code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: BASE_CHAIN_ID_HEX,
          chainName: 'Base',
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: ['https://mainnet.base.org'],
          blockExplorerUrls: ['https://basescan.org']
        }]
      })
    } else {
      throw err
    }
  }
}

function pad32 (hexNoPrefix) {
  return hexNoPrefix.padStart(64, '0')
}

/**
 * Send `amount` USDC to `payTo` on Base. Returns the tx hash.
 * Encodes the ERC-20 transfer calldata directly — no contract ABI lib needed.
 */
export async function sendUsdcBase ({ payTo, amount, from }) {
  const provider = getProvider()
  await ensureBaseChain(provider)

  const atomic = BigInt(Math.round(amount * 10 ** USDC_DECIMALS))
  const addrPart = pad32(payTo.toLowerCase().replace('0x', ''))
  const amountPart = pad32(atomic.toString(16))
  const data = `${ERC20_TRANSFER_SELECTOR}${addrPart}${amountPart}`

  const txHash = await provider.request({
    method: 'eth_sendTransaction',
    params: [{ from, to: BASE_USDC, data, value: '0x0' }]
  })
  return txHash
}
