# Payment Discovery Spec — Key Excerpts

Source: https://paymentauth.org/draft-payment-discovery-00.txt  
Also used by: https://x402scan.com/discovery/spec

---

## Document Location

Must be served at:
```
GET /openapi.json
```
Over HTTPS. `Content-Type: application/json`.  
Recommended: `Cache-Control: max-age=300`.

---

## Required Top-Level Fields

```json
{
  "openapi": "3.1.0",
  "info": { "title": "...", "version": "..." },
  "paths": { ... }
}
```

---

## x-service-info Extension (optional but strongly recommended)

```json
{
  "x-service-info": {
    "categories": ["data", "finance"],
    "docs": {
      "homepage":     "https://your-service.com",
      "apiReference": "https://your-service.com/openapi.json",
      "llms":         "https://your-service.com/llms.txt"
    }
  }
}
```

Categories (free-form, lowercase-hyphen): `communication`, `compute`, `data`,
`developer-tools`, `media`, `search`, `social`, `storage`, `travel`.
Max 5 per service.

---

## x-payment-info Extension (required on each paid operation)

Single-offer form:
```json
{
  "x-payment-info": {
    "intent":      "charge",
    "method":      "x402",
    "amount":      "5000",
    "currency":    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "description": "$0.005 USDC per call, paid on Solana"
  }
}
```

Multi-offer form (preferred):
```json
{
  "x-payment-info": {
    "offers": [
      { "intent": "charge", "method": "x402", "amount": "5000", "currency": "EPjFWdd5..." }
    ]
  }
}
```

| Field | Required | Notes |
|---|---|---|
| `intent` | Yes | `"charge"` (per-request) or `"session"` (pay-as-you-go) |
| `method` | Yes | Payment method: `"x402"` for Solana x402 |
| `amount` | Yes | Micro-units string. `"5000"` = $0.005 USDC (6 decimals). `null` = dynamic. |
| `currency` | Optional | Mint address (Solana) or ISO 4217 (fiat) |
| `description` | Optional | Human-readable note |

---

## 402 Response Declaration

Every paid operation must declare:
```json
{
  "responses": {
    "402": { "description": "Payment Required" }
  }
}
```

---

## Input Schema (required by x402scan)

Every paid operation needs at least one parameter with a schema, or a requestBody:

```json
{
  "parameters": [
    {
      "name":        "query",
      "in":          "query",
      "required":    true,
      "schema":      { "type": "string" },
      "description": "Search query"
    }
  ]
}
```

Path parameters use `"in": "path"`.

---

## Output Schema (recommended, required for full x402scan listing)

```json
{
  "responses": {
    "200": {
      "description": "Successful response",
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
              "result": { "type": "string" }
            }
          }
        }
      }
    }
  }
}
```

---

## Free Endpoints

Endpoints that don't require payment must declare `"security": []`:

```json
{
  "/openapi.json": {
    "get": {
      "summary": "OpenAPI discovery document",
      "security": [],
      "parameters": [],
      "responses": { "200": { "description": "OpenAPI 3.1 document" } }
    }
  }
}
```

---

## Relationship to the 402 Challenge

Discovery is advisory. The runtime 402 challenge is **always authoritative**.  
If discovery and the 402 challenge disagree on amount/method/currency — the 402 wins.

---

## x402 v2 Challenge Response Format

When a paid endpoint is probed without payment, it must return:

```
HTTP/1.1 402 Payment Required
payment-required: <base64-encoded-json>
Content-Type: application/json
```

The decoded `payment-required` header must be valid JSON with `x402Version: 2`:

```json
{
  "x402Version": 2,
  "resource": { "url": "...", "description": "...", "mimeType": "..." },
  "accepts": [{
    "scheme": "exact",
    "network": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    "amount": "5000",
    "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "payTo": "<wallet>",
    "maxTimeoutSeconds": 300,
    "extra": {}
  }]
}
```
