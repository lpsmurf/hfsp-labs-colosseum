// All calls go to the same origin (card.hfsp.cloud) so no CORS config needed.

async function post(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok && res.status !== 202) throw Object.assign(new Error(json.error || `HTTP ${res.status}`), { status: res.status, body: json })
  return json
}

async function get(path) {
  const res = await fetch(path)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
  return json
}

// ── Circles fulfillment ───────────────────────────────────────────────────

export async function circlesQuote({ email, items }) {
  return post('/api/circles/quote', { email, items })
}

export async function circlesFulfill({ orderId, txHash }) {
  return post('/api/circles/fulfill', { orderId, txHash })
}

export async function circlesStatus(orderId) {
  return get(`/api/circles/status/${orderId}`)
}

// ── Cryptorefills catalog (same endpoints as gnosis-card-frontend) ────────

export async function storeBrands(country = 'us') {
  return get(`/api/store/brands?country_code=${encodeURIComponent(country)}`)
}

export async function storeCatalog(country, brand) {
  return get(`/api/store/catalog?country_code=${encodeURIComponent(country)}&brand_name=${encodeURIComponent(brand)}`)
}
