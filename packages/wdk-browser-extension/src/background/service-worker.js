// WDK Multi-Chain Wallet — background service worker (Chrome MV3)
//
// Message protocol (popup → background):
//   WALLET_STATE   → {} → { initialized, unlocked, address, networkId }
//   WALLET_CREATE  → { password } → { mnemonic, address }
//   WALLET_IMPORT  → { mnemonic, password } → { address }
//   WALLET_UNLOCK  → { password } → { address }
//   WALLET_LOCK    → {} → ok
//   WALLET_BALANCE → {} → { native, nativeSymbol, usdt, usdtSymbol }
//   WALLET_SEND    → { to, amount, asset } → { hash }
//   NETWORK_GET    → {} → { networkId }
//   NETWORK_SET    → { networkId } → { address }
//   RPC_SET        → { networkId, rpcUrl } → ok

import WalletManagerSolana from '@tetherto/wdk-wallet-solana'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'
import WalletManagerBtc from '@tetherto/wdk-wallet-btc'
import WalletManagerSpark from '@tetherto/wdk-wallet-spark'
import WalletManager from '@tetherto/wdk-wallet'
import { encrypt, decrypt } from '../keystore.js'

// ── Network registry ──────────────────────────────────────────────────────────

const NETWORKS = {
  solana: {
    id: 'solana', name: 'Solana', symbol: 'SOL', nativeDecimals: 9,
    usdt: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', usdtDecimals: 6,
    defaultRpc: 'https://mainnet.helius-rpc.com/?api-key=b72c1253-4c5d-441b-8b54-46b08d10d447',
    type: 'solana'
  },
  ethereum: {
    id: 'ethereum', name: 'Ethereum', symbol: 'ETH', nativeDecimals: 18,
    usdt: '0xdAC17F958D2ee523a2206206994597C13D831ec7', usdtDecimals: 6,
    defaultRpc: 'https://eth.llamarpc.com',
    type: 'evm'
  },
  polygon: {
    id: 'polygon', name: 'Polygon', symbol: 'POL', nativeDecimals: 18,
    usdt: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', usdtDecimals: 6,
    defaultRpc: 'https://rpc.ankr.com/polygon',
    type: 'evm'
  },
  arbitrum: {
    id: 'arbitrum', name: 'Arbitrum', symbol: 'ETH', nativeDecimals: 18,
    usdt: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', usdtDecimals: 6,
    defaultRpc: 'https://rpc.ankr.com/arbitrum',
    type: 'evm'
  },
  plasma: {
    id: 'plasma', name: 'Plasma', symbol: 'ETH', nativeDecimals: 18,
    usdt: '0xdAC17F958D2ee523a2206206994597C13D831ec7', usdtDecimals: 6,
    defaultRpc: 'https://rpc.plasma.finance',
    type: 'evm'
  },
  bitcoin: {
    id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', nativeDecimals: 8,
    usdt: null,
    electrumWss: 'wss://electrum.blockstream.info:50004',
    type: 'btc'
  },
  spark: {
    id: 'spark', name: 'Lightning', symbol: 'BTC', nativeDecimals: 8,
    usdt: null,
    type: 'spark'
  }
}

const DEFAULT_NETWORK = 'solana'
const STORAGE_KEY_ENCRYPTED = 'wdk_wallet_encrypted'
const STORAGE_KEY_NETWORK   = 'wdk_active_network'
const STORAGE_KEY_RPC       = 'wdk_rpc_'

// ── In-memory state (lost when service worker sleeps) ─────────────────────────

const sessions = new Map() // networkId → { manager, account, address, accountIndex }
const accountIndexes = new Map() // networkId → accountIndex (persisted in memory)
let unlockedMnemonic = null

// ── Storage helpers ───────────────────────────────────────────────────────────

function storageGet (keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve))
}
function storageSet (items) {
  return new Promise((resolve) => chrome.storage.local.set(items, resolve))
}

async function getActiveNetworkId () {
  const data = await storageGet([STORAGE_KEY_NETWORK])
  return data[STORAGE_KEY_NETWORK] || DEFAULT_NETWORK
}

async function getRpcForNetwork (networkId) {
  const net = NETWORKS[networkId]
  const key = STORAGE_KEY_RPC + networkId
  const data = await storageGet([key])
  return data[key] || net.defaultRpc
}

// ── Session builder ───────────────────────────────────────────────────────────

async function buildSessionForNetwork (mnemonic, networkId, accountIndex = 0) {
  const net = NETWORKS[networkId]
  if (!net) throw new Error(`Unknown network: ${networkId}`)

  let manager, account, address

  switch (net.type) {
    case 'solana': {
      const rpc = await getRpcForNetwork(networkId)
      manager = new WalletManagerSolana(mnemonic, { provider: rpc })
      account = await manager.getAccount(accountIndex)
      address = await account.getAddress()
      break
    }
    case 'evm': {
      const rpc = await getRpcForNetwork(networkId)
      manager = new WalletManagerEvm(mnemonic, { provider: rpc })
      account = await manager.getAccount(accountIndex)
      address = await account.getAddress()
      break
    }
    case 'btc': {
      manager = new WalletManagerBtc(mnemonic, {
        client: { type: 'electrum-ws', clientConfig: { url: net.electrumWss } },
        network: 'bitcoin'
      })
      account = await manager.getAccount(accountIndex)
      address = await account.getAddress()
      break
    }
    case 'spark': {
      manager = new WalletManagerSpark(mnemonic, { network: 'MAINNET' })
      account = await manager.getAccount(accountIndex)
      address = await account.getAddress()
      break
    }
    default:
      throw new Error(`Unsupported network type: ${net.type}`)
  }

  return { manager, account, address, accountIndex }
}

async function getOrBuildSession (networkId) {
  if (sessions.has(networkId)) return sessions.get(networkId)
  if (!unlockedMnemonic) throw new Error('Wallet locked')
  const idx = accountIndexes.get(networkId) || 0
  const sess = await buildSessionForNetwork(unlockedMnemonic, networkId, idx)
  sessions.set(networkId, sess)
  return sess
}

function clearSessions () {
  for (const sess of sessions.values()) {
    try { sess.manager?.dispose?.() } catch {}
    try { sess.account?.dispose?.() } catch {}
  }
  sessions.clear()
  accountIndexes.clear()
  unlockedMnemonic = null
}

// ── Message handlers ──────────────────────────────────────────────────────────

async function handleWalletState () {
  const data = await storageGet([STORAGE_KEY_ENCRYPTED])
  const networkId = await getActiveNetworkId()
  const initialized = !!data[STORAGE_KEY_ENCRYPTED]
  const unlocked = !!unlockedMnemonic
  const sess = sessions.get(networkId)
  const address = sess?.address || null
  const accountIndex = sess?.accountIndex || 0
  return { initialized, unlocked, address, networkId, accountIndex }
}

async function handleWalletCreate ({ password }) {
  const mnemonic = WalletManager.getRandomSeedPhrase(12)
  const blob = await encrypt(mnemonic, password)
  await storageSet({ [STORAGE_KEY_ENCRYPTED]: blob })
  clearSessions()
  unlockedMnemonic = mnemonic
  const networkId = await getActiveNetworkId()
  const sess = await buildSessionForNetwork(mnemonic, networkId)
  sessions.set(networkId, sess)
  return { mnemonic, address: sess.address }
}

async function handleWalletImport ({ mnemonic, password }) {
  if (!WalletManager.isValidSeedPhrase(mnemonic)) throw new Error('Invalid seed phrase')
  const blob = await encrypt(mnemonic, password)
  await storageSet({ [STORAGE_KEY_ENCRYPTED]: blob })
  clearSessions()
  unlockedMnemonic = mnemonic
  const networkId = await getActiveNetworkId()
  const sess = await buildSessionForNetwork(mnemonic, networkId)
  sessions.set(networkId, sess)
  return { address: sess.address }
}

async function handleWalletUnlock ({ password }) {
  const data = await storageGet([STORAGE_KEY_ENCRYPTED])
  const blob = data[STORAGE_KEY_ENCRYPTED]
  if (!blob) throw new Error('No wallet found — set one up first')
  let mnemonic
  try { mnemonic = await decrypt(blob, password) }
  catch { throw new Error('Wrong password') }
  clearSessions()
  unlockedMnemonic = mnemonic
  const networkId = await getActiveNetworkId()
  const sess = await buildSessionForNetwork(mnemonic, networkId)
  sessions.set(networkId, sess)
  return { address: sess.address, networkId }
}

function handleWalletLock () {
  clearSessions()
  return { ok: true }
}

async function handleWalletBalance () {
  const networkId = await getActiveNetworkId()
  const net = NETWORKS[networkId]
  const sess = await getOrBuildSession(networkId)

  let native = 0
  let usdt = null

  switch (net.type) {
    case 'solana': {
      const lamports = await sess.account.getBalance()
      native = Number(lamports) / 10 ** net.nativeDecimals
      if (net.usdt) {
        try {
          const units = await sess.account.getTokenBalance(net.usdt)
          usdt = Number(units) / 10 ** net.usdtDecimals
        } catch {}
      }
      break
    }
    case 'evm': {
      const wei = await sess.account.getBalance()
      native = Number(wei) / 10 ** net.nativeDecimals
      if (net.usdt) {
        try {
          const units = await sess.account.getTokenBalance(net.usdt)
          usdt = Number(units) / 10 ** net.usdtDecimals
        } catch {}
      }
      break
    }
    case 'btc':
    case 'spark': {
      const sats = await sess.account.getBalance()
      native = Number(sats) / 10 ** net.nativeDecimals
      break
    }
  }

  return {
    native: native.toFixed(8),
    nativeSymbol: net.symbol,
    usdt: usdt !== null ? usdt.toFixed(6) : null,
    usdtSymbol: 'USDt'
  }
}

async function handleWalletSend ({ to, amount, asset = 'usdt' }) {
  const networkId = await getActiveNetworkId()
  const net = NETWORKS[networkId]
  const sess = await getOrBuildSession(networkId)

  let result

  switch (net.type) {
    case 'solana': {
      if (asset === 'usdt' && net.usdt) {
        const units = BigInt(Math.round(parseFloat(amount) * 10 ** net.usdtDecimals))
        result = await sess.account.transfer({ token: net.usdt, recipient: to, amount: units })
      } else {
        const lamports = BigInt(Math.round(parseFloat(amount) * 10 ** net.nativeDecimals))
        result = await sess.account.transfer({ recipient: to, amount: lamports })
      }
      break
    }
    case 'evm': {
      if (asset === 'usdt' && net.usdt) {
        const units = BigInt(Math.round(parseFloat(amount) * 10 ** net.usdtDecimals))
        result = await sess.account.transfer({ token: net.usdt, recipient: to, amount: units })
      } else {
        const wei = BigInt(Math.round(parseFloat(amount) * 10 ** net.nativeDecimals))
        result = await sess.account.transfer({ recipient: to, amount: wei })
      }
      break
    }
    case 'btc': {
      const sats = BigInt(Math.round(parseFloat(amount) * 10 ** net.nativeDecimals))
      result = await sess.account.sendTransaction({ to, value: sats })
      break
    }
    case 'spark': {
      const sats = Math.round(parseFloat(amount) * 10 ** net.nativeDecimals)
      result = await sess.account.sendTransaction({ to, value: sats })
      break
    }
  }

  return { hash: result.hash || result.txid || result.id || 'ok' }
}

async function handleNetworkGet () {
  const networkId = await getActiveNetworkId()
  return { networkId, network: NETWORKS[networkId] }
}

async function handleNetworkSet ({ networkId }) {
  if (!NETWORKS[networkId]) throw new Error(`Unknown network: ${networkId}`)
  await storageSet({ [STORAGE_KEY_NETWORK]: networkId })
  if (unlockedMnemonic) {
    const sess = await getOrBuildSession(networkId)
    return { address: sess.address }
  }
  return { address: null }
}

async function handleRpcSet ({ networkId, rpcUrl }) {
  const id = networkId || await getActiveNetworkId()
  await storageSet({ [STORAGE_KEY_RPC + id]: rpcUrl })
  // Drop cached session so it rebuilds with new RPC
  const sess = sessions.get(id)
  if (sess) {
    try { sess.manager?.dispose?.() } catch {}
    try { sess.account?.dispose?.() } catch {}
    sessions.delete(id)
  }
  return { ok: true }
}


async function handleWalletQuote ({ to, amount, asset = 'usdt' }) {
  if (!to || !amount) return { fee: null, feeSymbol: null }
  const networkId = await getActiveNetworkId()
  const net = NETWORKS[networkId]
  const sess = await getOrBuildSession(networkId)

  try {
    let fee = null
    let feeSymbol = net.symbol

    switch (net.type) {
      case 'solana': {
        if (asset === 'usdt' && net.usdt) {
          const units = BigInt(Math.round(parseFloat(amount) * 10 ** net.usdtDecimals))
          const q = await sess.account.quoteTransfer({ token: net.usdt, recipient: to, amount: units })
          fee = (Number(q.fee) / 1e9).toFixed(6)
        } else {
          const lamports = BigInt(Math.round(parseFloat(amount) * 1e9))
          const q = await sess.account.quoteSendTransaction({ to, value: lamports })
          fee = (Number(q.fee) / 1e9).toFixed(6)
        }
        break
      }
      case 'evm': {
        if (asset === 'usdt' && net.usdt) {
          const units = BigInt(Math.round(parseFloat(amount) * 10 ** net.usdtDecimals))
          const q = await sess.account.quoteTransfer({ token: net.usdt, recipient: to, amount: units })
          fee = (Number(q.fee) / 1e18).toFixed(8)
        } else {
          const wei = BigInt(Math.round(parseFloat(amount) * 1e18))
          const q = await sess.account.quoteSendTransaction({ to, value: wei })
          fee = (Number(q.fee) / 1e18).toFixed(8)
        }
        break
      }
      case 'btc': {
        const sats = BigInt(Math.round(parseFloat(amount) * 1e8))
        const q = await sess.account.quoteSendTransaction({ to, value: sats })
        fee = (Number(q.fee) / 1e8).toFixed(8)
        break
      }
      case 'spark':
        fee = '0.00000000'
        break
    }

    return { fee, feeSymbol }
  } catch {
    return { fee: null, feeSymbol: null }
  }
}


async function handleWalletAccountSet ({ index }) {
  const idx = Math.max(0, Math.min(9, parseInt(index) || 0)) // clamp 0-9
  const networkId = await getActiveNetworkId()
  accountIndexes.set(networkId, idx)
  // Drop cached session so it rebuilds with new account index
  const old = sessions.get(networkId)
  if (old) {
    try { old.manager?.dispose?.() } catch {}
    try { old.account?.dispose?.() } catch {}
    sessions.delete(networkId)
  }
  if (unlockedMnemonic) {
    const sess = await buildSessionForNetwork(unlockedMnemonic, networkId, idx)
    sessions.set(networkId, sess)
    return { address: sess.address, accountIndex: idx }
  }
  return { address: null, accountIndex: idx }
}


async function handleWalletSign ({ message }) {
  if (!message) throw new Error('Message is required')
  const networkId = await getActiveNetworkId()
  const net = NETWORKS[networkId]
  const sess = await getOrBuildSession(networkId)
  if (net.type === 'btc' || net.type === 'spark') {
    throw new Error('Message signing not supported on ' + net.name)
  }
  const sig = await sess.account.sign(message)
  return { signature: sig, address: sess.address, network: networkId }
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { type, ...payload } = message

  const handlers = {
    WALLET_STATE:   () => handleWalletState(),
    WALLET_CREATE:  () => handleWalletCreate(payload),
    WALLET_IMPORT:  () => handleWalletImport(payload),
    WALLET_UNLOCK:  () => handleWalletUnlock(payload),
    WALLET_LOCK:    () => handleWalletLock(),
    WALLET_BALANCE: () => handleWalletBalance(),
    WALLET_SEND:    () => handleWalletSend(payload),
    NETWORK_GET:    () => handleNetworkGet(),
    NETWORK_SET:    () => handleNetworkSet(payload),
    WALLET_SIGN:    () => handleWalletSign(payload),
    WALLET_ACCOUNT_SET: () => handleWalletAccountSet(payload),
    WALLET_QUOTE:       () => handleWalletQuote(payload),
    RPC_SET:        () => handleRpcSet(payload)
  }

  const handler = handlers[type]
  if (!handler) {
    sendResponse({ error: `Unknown message type: ${type}` })
    return true
  }

  handler()
    .then((data) => sendResponse({ data }))
    .catch((err) => sendResponse({ error: err.message }))

  return true
})
