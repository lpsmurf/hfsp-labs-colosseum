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
