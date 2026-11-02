import { useState, useEffect } from 'react'
import { storeBrands, storeCatalog, storeOrder } from '../api.js'
import { connectSolana, sendUsdcSolana } from '../wallets/solana.js'

// Cryptorefills mini-app — browse gift cards / top-ups / eSIMs and redeem with
// Solana USDC via the x402-store proxy. Reuses the Phantom wallet flow.

const COUNTRIES = [
  { code: 'us', label: 'United States' },
  { code: 'gb', label: 'United Kingdom' },
  { code: 'de', label: 'Germany' },
  { code: 'fr', label: 'France' },
  { code: 'es', label: 'Spain' },
  { code: 'it', label: 'Italy' }
]

function shorten (s) { return s && s.length > 14 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s }

// Cryptorefills order item. Gift cards require a beneficiary_account (the email
// the card is delivered to); ranged products also need a product_value.
function buildItem (product, email) {
  return {
    product_id: product.id,
    beneficiary_account: email,
    ...(product.value ? { product_value: product.value } : {})
  }
}

export default function Redeem () {
  const [country, setCountry] = useState('us')
  const [brands, setBrands] = useState(null)
  const [brandsLoading, setBrandsLoading] = useState(false)
  const [filter, setFilter] = useState('')
  const [error, setError] = useState('')

  const [brand, setBrand] = useState(null)        // selected brand
  const [catalog, setCatalog] = useState(null)    // products for brand
  const [product, setProduct] = useState(null)    // selected product

  const [view, setView] = useState('browse')      // browse | product | checkout | done

  // checkout
  const [email, setEmail] = useState('')
  const [account, setAccount] = useState('')
  const [pay, setPay] = useState(null)            // x402 price from phase 1
  const [busy, setBusy] = useState('')            // '', 'pricing', 'paying', 'fulfilling'
  const [result, setResult] = useState(null)

  // ── Load brands when country changes ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setBrandsLoading(true); setError(''); setBrands(null)
    storeBrands(country)
      .then(data => { if (!cancelled) setBrands(normalizeBrands(data)) })
      .catch(err => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setBrandsLoading(false) })
    return () => { cancelled = true }
  }, [country])

  function resetToBrowse () {
    setBrand(null); setCatalog(null); setProduct(null)
    setPay(null); setResult(null); setEmail(''); setBusy(''); setError('')
    setView('browse')
  }

  async function openBrand (b) {
    setBrand(b); setError(''); setCatalog(null); setProduct(null); setView('product')
    try {
      const data = await storeCatalog(country, b.name)
      setCatalog(normalizeProducts(data))
    } catch (err) {
      setError(err.message)
    }
  }

  function chooseProduct (p) {
    setProduct(p); setPay(null); setResult(null); setError(''); setView('checkout')
  }

  // ── x402 checkout ───────────────────────────────────────────────────────────
  async function getPrice () {
    setError('')
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) { setError('Enter a valid email for delivery'); return }
    setBusy('pricing')
    try {
      const items = [buildItem(product, email)]
      const res = await storeOrder({ email, items })
      if (res.paymentRequired) setPay(res.pay)
      else { setResult(res.data); setView('done') }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function connect () {
    setError('')
    try { setAccount(await connectSolana()) } catch (err) { setError(err.message) }
  }

  async function payAndRedeem () {
    setError('')
    setBusy('paying')
    try {
      const usd = Number(pay.amountUsd)
      const txSig = await sendUsdcSolana({ payTo: pay.payTo, amount: usd })
      setBusy('fulfilling')
      const items = [buildItem(product, email)]
      const res = await storeOrder({ email, items, txSig })
      if (res.paymentRequired) {
        // Shouldn't happen — paid but still asked. Surface gracefully.
        setError('Payment sent but not yet recognized. Keep your tx signature and contact support.')
      } else {
        setResult(res.data)
        setView('done')
      }
    } catch (err) {
      setError(err.message || 'Payment failed')
    } finally {
      setBusy('')
    }
  }

  const filteredBrands = (brands || []).filter(b =>
    !filter || b.name.toLowerCase().includes(filter.toLowerCase()))

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="card">
      <div className="card-head">
        <h1>Redeem your balance</h1>
        <p>Gift cards, mobile top-ups &amp; eSIMs from 5,000+ brands — pay with USDC. Powered by Cryptorefills via x402.</p>
      </div>

      {error && <div className="alert error">{error}</div>}

      {/* ── Browse brands ── */}
      {view === 'browse' && (
        <>
          <div className="redeem-controls">
            <select className="select" value={country} onChange={e => setCountry(e.target.value)}>
              {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
            <input
              className="redeem-search" placeholder="Search brands…"
              value={filter} onChange={e => setFilter(e.target.value)}
            />
          </div>

          {brandsLoading && <div className="working"><div className="spinner" /><p>Loading brands…</p></div>}

          {!brandsLoading && brands && (
            <div className="brand-grid">
              {filteredBrands.slice(0, 60).map(b => (
                <button key={b.name} className="brand-tile" onClick={() => openBrand(b)}>
                  {b.logo
                    ? <img src={b.logo} alt={b.name} loading="lazy" />
                    : <span className="brand-initial">{b.name.charAt(0)}</span>}
                  <span className="brand-name">{b.name}</span>
                </button>
              ))}
              {filteredBrands.length === 0 && <p className="muted">No brands match “{filter}”.</p>}
            </div>
          )}
        </>
      )}

      {/* ── Brand products ── */}
      {view === 'product' && brand && (
        <>
          <button className="btn ghost back-inline" onClick={resetToBrowse}>← All brands</button>
          <div className="brand-head">
            {brand.logo && <img src={brand.logo} alt={brand.name} className="brand-head-logo" />}
            <h2>{brand.name}</h2>
          </div>
          {!catalog && <div className="working"><div className="spinner" /><p>Loading products…</p></div>}
          {catalog && (
            <div className="product-list">
              {catalog.map(p => (
                <button key={p.id} className="product-row" onClick={() => chooseProduct(p)}>
                  <span className="product-name">{p.name}</span>
                  <span className="product-price">{p.priceLabel}</span>
                </button>
              ))}
              {catalog.length === 0 && <p className="muted">No products available for this brand.</p>}
            </div>
          )}
        </>
      )}

      {/* ── Checkout ── */}
      {view === 'checkout' && product && (
        <>
          <button className="btn ghost back-inline" onClick={() => setView('product')}>← Back</button>
          <div className="checkout">
            <div className="checkout-summary">
              <span>{brand.name}</span>
              <strong>{product.name}</strong>
              <span className="muted">{product.priceLabel}</span>
            </div>

            {!pay ? (
              <>
                <label className="field">
                  <span>Delivery email</span>
                  <input type="email" value={email} placeholder="you@email.com"
                    onChange={e => setEmail(e.target.value.trim())} />
                </label>
                <button className="btn primary" onClick={getPrice} disabled={busy === 'pricing'}>
                  {busy === 'pricing' ? 'Getting price…' : 'Get price'}
                </button>
              </>
            ) : (
              <>
                <div className="quote-rows">
                  <Row k="Item" v={product.name} />
                  <Row k="Price" v={`$${Number(pay.amountUsd).toFixed(2)} USDC`} strong />
                  <Row k="Delivery" v={email} muted />
                  <Row k="Pay with" v="Solana USDC (Phantom)" muted />
                </div>
                {busy === 'paying' || busy === 'fulfilling' ? (
                  <div className="working">
                    <div className="spinner" />
                    <p>{busy === 'paying' ? 'Confirm the payment in Phantom…' : 'Redeeming your gift card…'}</p>
                  </div>
                ) : !account ? (
                  <button className="btn wallet" onClick={connect}>Connect Phantom</button>
                ) : (
                  <>
                    <div className="connected"><span className="dot ok" /> Phantom · {shorten(account)}</div>
                    <button className="btn primary" onClick={payAndRedeem}>
                      Pay ${Number(pay.amountUsd).toFixed(2)} USDC →
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* ── Done ── */}
      {view === 'done' && (
        <div className="done">
          <div className="check">✓</div>
          <h2>Redeemed</h2>
          <p>Your order is confirmed. Delivery details were sent to {email}.</p>
          {result?.order_id && <p className="muted small">Order: {result.order_id}</p>}
          <RedeemResult result={result} />
          <button className="btn primary" onClick={resetToBrowse}>Redeem something else</button>
        </div>
      )}
    </div>
  )
}

function Row ({ k, v, strong, muted }) {
  return (
    <div className={`qrow ${strong ? 'strong' : ''} ${muted ? 'muted' : ''}`}>
      <span>{k}</span><span>{v}</span>
    </div>
  )
}

function RedeemResult ({ result }) {
  // Cryptorefills returns redemption data shapes that vary by product type.
  const cards = result?.cards || result?.codes || result?.vouchers
  if (!Array.isArray(cards) || cards.length === 0) return null
  return (
    <div className="redeem-codes">
      {cards.map((c, i) => (
        <div key={i} className="code-box">
          {c.code && <div><span className="muted small">Code</span><code>{c.code}</code></div>}
          {c.pin && <div><span className="muted small">PIN</span><code>{c.pin}</code></div>}
          {c.url && <a href={c.url} target="_blank" rel="noreferrer" className="btn ghost">Open</a>}
        </div>
      ))}
    </div>
  )
}

// ── Normalizers — Cryptorefills payloads vary; keep the UI tolerant ────────────
function normalizeBrands (data) {
  const list = data?.brands || data?.data || data?.results || (Array.isArray(data) ? data : [])
  return list.map(b => ({
    name: b.brand_name || b.name || b.title || String(b),
    logo: b.logo_url || b.logo || b.image || null
  })).filter(b => b.name)
}

function normalizeProducts (data) {
  const list = data?.products || data?.catalog || data?.data || data?.results || (Array.isArray(data) ? data : [])
  return list.map(p => {
    const id = p.product_id || p.id || p.sku
    const faceLabel = p.denomination_label || p.denomination || p.product_name || 'Gift card'
    // Catalog gives price_usdc directly; show it so the user sees the USDC cost up front.
    const priceLabel = p.price_usdc
      ? `$${Number(p.price_usdc).toFixed(2)} USDC`
      : (p.face_value_usd ? `$${p.face_value_usd}` : 'Variable')
    return {
      id,
      name: p.product_name || p.name || p.title || faceLabel,
      value: p.is_range ? undefined : (p.value ?? p.face_value_usd ?? undefined),
      priceLabel
    }
  }).filter(p => p.id)
}
