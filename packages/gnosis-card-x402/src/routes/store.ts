/**
 * /api/store — same-origin proxy to the x402-store (Cryptorefills) backend.
 *
 * The store enables CORS only in dev, so the browser can't call store.hfsp.cloud
 * directly. We forward here instead, so the Redeem mini-app stays same-origin and
 * reuses the frontend's existing Phantom payment flow.
 *
 *   GET  /api/store/brands?country_code=us
 *   GET  /api/store/catalog?country_code=us&brand_name=Amazon.com
 *   POST /api/store/orders            (x402 — forwards X-Solana-Tx header)
 *   GET  /api/store/orders/:id
 */

import { Router } from 'express';
import { config } from '../config.js';

export const storeRouter = Router();

const STORE = config.STORE_API_URL.replace(/\/$/, '');

async function forward(
  method: 'GET' | 'POST',
  path: string,
  opts: { query?: string; body?: unknown; txSig?: string } = {},
) {
  const url = `${STORE}${path}${opts.query ? `?${opts.query}` : ''}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.txSig) headers['X-Solana-Tx'] = opts.txSig;

  const res = await fetch(url, {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(opts.body ?? {}) : undefined,
  });
  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = { ok: false, error: text }; }
  return { status: res.status, json };
}

// GET /api/store/brands
storeRouter.get('/brands', async (req, res) => {
  const country = String(req.query.country_code ?? 'us').toLowerCase();
  try {
    const { status, json } = await forward('GET', '/api/brands', { query: `country_code=${encodeURIComponent(country)}` });
    res.status(status).json(json);
  } catch (err: unknown) {
    res.status(502).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/store/catalog
storeRouter.get('/catalog', async (req, res) => {
  const country = String(req.query.country_code ?? 'us').toLowerCase();
  const brand = String(req.query.brand_name ?? '');
  if (!brand) { res.status(400).json({ ok: false, error: 'brand_name required' }); return; }
  try {
    const query = `country_code=${encodeURIComponent(country)}&brand_name=${encodeURIComponent(brand)}`;
    const { status, json } = await forward('GET', '/api/catalog', { query });
    res.status(status).json(json);
  } catch (err: unknown) {
    res.status(502).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/store/orders — x402 (phase 1 = no header → 402 price; phase 2 = X-Solana-Tx)
storeRouter.post('/orders', async (req, res) => {
  const txSig = (req.headers['x-solana-tx'] as string | undefined)?.trim();
  try {
    const { status, json } = await forward('POST', '/api/orders', { body: req.body, txSig });
    res.status(status).json(json);
  } catch (err: unknown) {
    res.status(502).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/store/orders/:id
storeRouter.get('/orders/:id', async (req, res) => {
  try {
    const { status, json } = await forward('GET', `/api/orders/${encodeURIComponent(req.params.id)}`);
    res.status(status).json(json);
  } catch (err: unknown) {
    res.status(502).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});
