# Audit Finding: stableenrich.dev + stabletravel.dev — Catalog Endpoints Return 404

**Date:** 2026-06-05  
**Auditor:** HFSP Labs  
**Severity:** Medium  
**Type:** catalog-data-quality / broken-endpoint  
**Affects:** stableenrich.dev (2,684 calls/30d), stabletravel.dev (1,901 calls/30d)

---

## Summary

The agentic.market catalog lists incorrect endpoint paths for both stableenrich.dev and stabletravel.dev. The registered paths return Next.js 404 HTML pages, not x402 responses. Despite this, these services show thousands of calls per month — suggesting the real endpoints are at different paths.

---

## Evidence

### stableenrich.dev

**Catalog says:** `POST https://stableenrich.dev/api/enrich`  
**Actual response:** Next.js 404 HTML page  
**Correct endpoints** (from catalog raw data):
- `POST https://stableenrich.dev/api/apollo/org-enrich`
- `POST https://stableenrich.dev/api/apollo/org-search`

```bash
curl -s -X POST "https://stableenrich.dev/api/enrich" \
  -H "Content-Type: application/json" -d '{}'
# → 200 with Next.js 404 HTML (not a 402!)
```

### stabletravel.dev

**Catalog says:** `POST https://stabletravel.dev/api/travel-data`  
**Actual response:** Next.js 404 HTML page  

```bash
curl -s -X POST "https://stabletravel.dev/api/travel-data" \
  -H "Content-Type: application/json" -d '{}'
# → 200 with Next.js 404 HTML (not a 402!)
```

---

## Root Cause

The agentic.market catalog has stale/wrong endpoint paths. The services are likely live and working at their correct endpoints, but the catalog entry has never been updated.

---

## Impact

Any agent querying the catalog and blindly hitting the listed endpoint will:
1. Get a 200 status (not 402)
2. Receive HTML instead of JSON
3. Potentially treat this as a "free" unconfigured endpoint and not pay

This is a **catalog data quality** issue that also affects agent trust in the marketplace.

---

## Reproduce

```bash
# Both return 404 HTML with status 200
curl -o /dev/null -w "%{http_code}" -X POST https://stableenrich.dev/api/enrich
curl -o /dev/null -w "%{http_code}" -X POST https://stabletravel.dev/api/travel-data
```

---

## GitHub Issues to File

- [ ] agentic.market: update stableenrich.dev catalog entry to correct endpoint path
- [ ] agentic.market: update stabletravel.dev catalog entry to correct endpoint path
- [ ] stableenrich.dev: `GET /api/enrich` should return 404 properly or redirect to correct endpoint
