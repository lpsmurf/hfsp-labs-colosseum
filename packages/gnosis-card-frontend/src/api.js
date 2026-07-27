// API client for the gnosis-card-x402 backend.
import { API_BASE } from './config.js'

async function req (path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data.error || data.message || `Request failed (${res.status})`
    const err = new Error(msg)
    err.status = res.status
    err.body = data
    throw err
  }
  return data
}

/**
 * GET /api/card/topup/quote
 * @returns { quote, payment }
 */
export function getQuote ({ amount, safeAddress, currency, sourceChain }) {
  const params = new URLSearchParams({
    amount: String(amount),
    safeAddress,
    currency,
    sourceChain
  })
  return req(`/api/card/topup/quote?${params}`)
}

/**
 * POST /api/card/topup  — submit payment proof (X-Payment header).
 * @returns { orderId, status, poll }
 */
export function submitTopup ({ amount, safeAddress, currency, sourceChain, signature, chain }) {
  return req('/api/card/topup', {
    method: 'POST',
    headers: {
      'X-Payment': signature,
      'X-Payment-Chain': chain
    },
    body: JSON.stringify({ amount, safeAddress, currency, sourceChain })
  })
}

/**
 * GET /api/card/topup/:orderId — poll bridge status.
 * @returns { status, srcTxHash, dstTxHash, message }
 */
export function getOrderStatus (orderId) {
  return req(`/api/card/topup/${encodeURIComponent(orderId)}`)
}

/**
 * GET /api/card/safe/inspect — classify a destination address on Gnosis Chain.
 * @returns { kind: 'gnosispay'|'safe'|'wallet', isSafe, safeVersion, balances }
 */
export function inspectSafe (address) {
  return req(`/api/card/safe/inspect?address=${encodeURIComponent(address)}`)
}

// ─── Cryptorefills store (proxied via /api/store) ──────────────────────────────

export function storeBrands (countryCode = 'us') {
  return req(`/api/store/brands?country_code=${encodeURIComponent(countryCode)}`)
}

export function storeCatalog (countryCode, brandName) {
  const params = new URLSearchParams({ country_code: countryCode, brand_name: brandName })
  return req(`/api/store/catalog?${params}`)
}

/**
 * POST /api/store/orders — x402.
 * Phase 1 (no txSig): backend replies HTTP 402 with the price. We surface that as
 *   { paymentRequired: true, pay } instead of throwing.
 * Phase 2 (txSig): returns { ok, data } with the redeemed gift card.
 */
export async function storeOrder ({ email, items, txSig }) {
  const headers = txSig ? { 'X-Solana-Tx': txSig } : {}
  try {
    const data = await req('/api/store/orders', {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, items })
    })
    return { paymentRequired: false, ...data }
  } catch (err) {
    if (err.status === 402 && err.body?.pay) {
      return { paymentRequired: true, pay: err.body.pay }
    }
    throw err
  }
}

export function storeOrderStatus (id) {
  return req(`/api/store/orders/${encodeURIComponent(id)}`)
}
