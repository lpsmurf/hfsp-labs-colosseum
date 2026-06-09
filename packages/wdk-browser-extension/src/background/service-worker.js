// WDK Solana Wallet — background service worker (Chrome MV3)
//
// Message protocol (popup → background):
//   WALLET_STATE   → { initialized, unlocked, address }
//   WALLET_CREATE  → { password } → { mnemonic, address }
//   WALLET_IMPORT  → { mnemonic, password } → { address }
//   WALLET_UNLOCK  → { password } → { address }
//   WALLET_LOCK    → {} → ok
//   WALLET_BALANCE → {} → { sol, usdt }
//   WALLET_SEND    → { to, amount } → { hash }
//   RPC_SET        → { rpcUrl } → ok

import WalletManagerSolana from '@tetherto/wdk-wallet-solana'
import WalletManager from '@tetherto/wdk-wallet'
import { encrypt, decrypt } from '../keystore.js'

const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
const DEFAULT_RPC = 'https://api.mainnet-beta.solana.com'
const STORAGE_KEY_ENCRYPTED = 'wdk_wallet_encrypted'
const STORAGE_KEY_RPC = 'wdk_wallet_rpc'

// In-memory session state — cleared when service worker sleeps
let session = null // { manager, account, address }

// ── Helpers ──────────────────────────────────────────────────────────────────

function storageGet (keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve))
}

function storageSet (items) {
  return new Promise((resolve) => chrome.storage.local.set(items, resolve))
}

async function getRpcUrl () {
  const data = await storageGet([STORAGE_KEY_RPC])
  return data[STORAGE_KEY_RPC] || DEFAULT_RPC
}

async function buildSession (mnemonic) {
  const rpcUrl = await getRpcUrl()
  const manager = new WalletManagerSolana(mnemonic, { provider: rpcUrl })
  const account = await manager.getAccount(0)
  const address = await account.getAddress()
  return { manager, account, address }
}

// ── Message handlers ─────────────────────────────────────────────────────────

async function handleWalletState () {
  const data = await storageGet([STORAGE_KEY_ENCRYPTED])
  const initialized = !!data[STORAGE_KEY_ENCRYPTED]
  const unlocked = !!session
  const address = session?.address || null
  return { initialized, unlocked, address }
}

async function handleWalletCreate ({ password }) {
  const mnemonic = WalletManager.getRandomSeedPhrase(12)
  const blob = await encrypt(mnemonic, password)
  await storageSet({ [STORAGE_KEY_ENCRYPTED]: blob })
  session = await buildSession(mnemonic)
  return { mnemonic, address: session.address }
}

async function handleWalletImport ({ mnemonic, password }) {
  if (!WalletManager.isValidSeedPhrase(mnemonic)) {
    throw new Error('Invalid seed phrase')
  }
  const blob = await encrypt(mnemonic, password)
  await storageSet({ [STORAGE_KEY_ENCRYPTED]: blob })
  session = await buildSession(mnemonic)
  return { address: session.address }
}

async function handleWalletUnlock ({ password }) {
  const data = await storageGet([STORAGE_KEY_ENCRYPTED])
  const blob = data[STORAGE_KEY_ENCRYPTED]
  if (!blob) throw new Error('No wallet found — set one up first')
  let mnemonic
  try {
    mnemonic = await decrypt(blob, password)
  } catch {
    throw new Error('Wrong password')
  }
  session = await buildSession(mnemonic)
  return { address: session.address }
}

function handleWalletLock () {
  if (session?.account) {
    try { session.account.dispose() } catch {}
  }
  session = null
  return { ok: true }
}

async function handleWalletBalance () {
  if (!session) throw new Error('Wallet locked')
  const lamports = await session.account.getBalance()
  const sol = Number(lamports) / 1e9
  let usdt = 0
  try {
    const units = await session.account.getTokenBalance(USDT_MINT)
    usdt = Number(units) / 1e6
  } catch {
    // account may have no USDT ATA yet
  }
  return { sol: sol.toFixed(6), usdt: usdt.toFixed(6) }
}

async function handleWalletSend ({ to, amount }) {
  if (!session) throw new Error('Wallet locked')
  // amount is a string like "1.50" (USDt, 6 decimals)
  const units = BigInt(Math.round(parseFloat(amount) * 1e6))
  const result = await session.account.transfer({
    token: USDT_MINT,
    recipient: to,
    amount: units
  })
  return { hash: result.hash }
}

async function handleRpcSet ({ rpcUrl }) {
  await storageSet({ [STORAGE_KEY_RPC]: rpcUrl })
  // Rebuild session with new RPC if unlocked
  if (session) {
    const data = await storageGet([STORAGE_KEY_ENCRYPTED])
    const blob = data[STORAGE_KEY_ENCRYPTED]
    // We only rebuild if we have the encrypted seed; user must re-unlock otherwise
    // For a live session we can't re-derive without password, so just clear session
    if (session.account) {
      try { session.account.dispose() } catch {}
    }
    session = null
  }
  return { ok: true }
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

  return true // keep message channel open for async response
})
