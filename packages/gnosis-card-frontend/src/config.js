// Frontend config — mirrors the gnosis-card-x402 backend constants.

export const API_BASE = import.meta.env.VITE_API_BASE || '' // '' = same origin / vite proxy

// Solana — defaults to the backend's server-side RPC proxy (keeps the Helius
// key off the client). Override with VITE_SOLANA_RPC only for local testing.
// web3.js Connection requires an absolute URL, so resolve against the origin.
const RPC_PROXY_PATH = '/api/rpc/solana'
const rpcBase = API_BASE || (typeof window !== 'undefined' ? window.location.origin : '')
export const SOLANA_RPC = import.meta.env.VITE_SOLANA_RPC || `${rpcBase}${RPC_PROXY_PATH}`
export const SOLANA_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

// Base
export const BASE_CHAIN_ID = 8453
export const BASE_CHAIN_ID_HEX = '0x2105'
export const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
export const BASE_RPC = import.meta.env.VITE_BASE_RPC || 'https://mainnet.base.org'

// Product
export const CURRENCIES = ['USDC', 'EURe', 'GBPe']
export const SOURCE_CHAINS = [
  { id: 'solana', label: 'Solana', wallet: 'Phantom' },
  { id: 'base', label: 'Base', wallet: 'MetaMask' }
]

export const GNOSIS_TOKENS = {
  USDC: '0x2a22f9c3b484c3629090feed35f17ff8f88f76f0',
  EURe: '0xcB444e90D8198415266c6a2724b7900fb12FC56E',
  GBPe: '0x5Cb9073902F2035222B9749F8fB0c9BFe5527108'
}
