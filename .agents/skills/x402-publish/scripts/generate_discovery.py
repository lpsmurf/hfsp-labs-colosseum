#!/usr/bin/env python3
"""
generate_discovery.py <service.json>

Reads a service config and generates a TypeScript module exporting
`openApiDoc` — the full OpenAPI 3.1.0 discovery document for x402scan.

The output is a self-contained .ts file ready to drop into any Express project.
"""

import json, sys, textwrap, os
from pathlib import Path

def bail(msg: str):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)

def load_config(path: str) -> dict:
    try:
        with open(path) as f:
            return json.load(f)
    except FileNotFoundError:
        bail(f"Config file not found: {path}")
    except json.JSONDecodeError as e:
        bail(f"Invalid JSON in {path}: {e}")

HTTP_METHODS = {"get", "put", "post", "delete", "options", "head", "patch", "trace"}

def validate_route(ep, label: str):
    if not isinstance(ep, dict):
        bail(f"{label} entries must be objects")
    if not isinstance(ep.get("path"), str) or not ep["path"].strip():
        bail(f"{label} entry is missing a non-empty path")
    method = str(ep.get("method", "get")).lower()
    if method not in HTTP_METHODS:
        bail(f"{label} {ep['path']}: unsupported HTTP method {ep.get('method')!r}")

def validate_config(c: dict):
    required = ["name", "title", "description", "baseUrl", "price", "categories", "endpoints"]
    for f in required:
        if f not in c:
            bail(f"Missing required field: {f}")
    price = c["price"]
    for f in ["amount", "currency", "payTo"]:
        if f not in price:
            bail(f"Missing price.{f}")
    if not c["endpoints"]:
        bail("endpoints[] must have at least one entry")
    if price["amount"] is not None:
        try:
            int(price["amount"])
        except (TypeError, ValueError):
            bail(f"price.amount must be an integer micro-USDC value or null (dynamic), got {price['amount']!r}")
    for ep in c.get("freeEndpoints", []):
        validate_route(ep, "freeEndpoints")
    for ep in c["endpoints"]:
        validate_route(ep, "endpoints")
        has_params = any(isinstance(p, dict) and p.get("schema") for p in ep.get("params") or [])
        if not has_params and not ep.get("requestBody"):
            bail(f"Paid endpoint {ep.get('method', 'GET').upper()} {ep.get('path')} needs params with a schema or a requestBody")

def price_label(amount) -> str:
    """Human price for comments/descriptions; null amount means dynamic pricing."""
    if amount is None:
        return "Dynamic USDC price"
    return f"${int(amount) / 1e6:.4g} USDC"

def build_openapi(c: dict) -> dict:
    price = c["price"]
    payment_offer = {
        "intent":      c.get("intent", "charge"),
        "method":      "x402",
        "amount":      None if price["amount"] is None else str(price["amount"]),
        "currency":    price["currency"],
        "description": c.get("priceDescription",
                             f"{price_label(price['amount'])} per call, paid on Solana"),
    }

    paths: dict = {}

    # Free discovery endpoint
    paths["/openapi.json"] = {
        "get": {
            "summary":   "OpenAPI discovery document",
            "security":  [],
            "parameters": [],
            "responses": {
                "200": {
                    "description": "OpenAPI 3.1 document",
                    "content": {"application/json": {"schema": {"type": "object"}}},
                }
            },
        }
    }

    # Extra free endpoints declared in config
    for ep in c.get("freeEndpoints", []):
        method = ep.get("method", "get").lower()
        paths.setdefault(ep["path"], {})[method] = {
            "summary":    ep.get("summary", ep["path"]),
            "security":   [],
            "parameters": ep.get("params", []),
            "responses": {
                "200": {
                    "description": "Successful response",
                    "content": {"application/json": {
                        "schema": ep.get("responseSchema", {"type": "object"})
                    }},
                }
            },
        }

    # Paid endpoints
    for ep in c["endpoints"]:
        method = ep.get("method", "get").lower()
        op = {
            "summary":          ep.get("summary", ep["path"]),
            "parameters":       ep.get("params", []),
            **({"requestBody": ep["requestBody"]} if ep.get("requestBody") else {}),
            "x-payment-info":   {"offers": [payment_offer]},
            "responses": {
                "200": {
                    "description": "Successful response",
                    "content": {"application/json": {
                        "schema": ep.get("responseSchema", {"type": "object"})
                    }},
                },
                "402": {"description": "Payment Required"},
            },
        }
        paths.setdefault(ep["path"], {})[method] = op

    docs = c.get("docs", {})
    docs.setdefault("homepage", c["baseUrl"])
    docs.setdefault("apiReference", f"{c['baseUrl']}/openapi.json")

    contact = c.get("contact", {})

    doc = {
        "openapi": "3.1.0",
        "info": {
            "title":       c["title"],
            "version":     c.get("version", "1.0.0"),
            "description": c["description"],
        },
        "x-service-info": {
            "categories": c["categories"][:5],
            "docs":       docs,
        },
        "servers": [{"url": c["baseUrl"]}],
        "paths":   paths,
    }
    if contact:
        doc["info"]["contact"] = contact
    return doc

def emit_typescript(doc: dict, c: dict) -> str:
    doc_json = json.dumps(doc, indent=2)
    # Indent the JSON block inside the TS const
    indented = textwrap.indent(doc_json, "  ")

    price = c["price"]

    lines = [
        f"// Auto-generated by x402-publish skill — {c['name']}",
        f"// Re-run: python3 .agents/skills/x402-publish/scripts/generate_discovery.py service.json",
        f"//",
        f"// Serve this at GET /openapi.json (no payment gate, Cache-Control: max-age=300)",
        f"// Payment: {price_label(price['amount'])} per call → {price['payTo'][:8]}…",
        "",
        "export const openApiDoc = " + indented.lstrip() + " as const;",
    ]
    return "\n".join(lines) + "\n"

def main():
    if len(sys.argv) < 2:
        bail("Usage: generate_discovery.py <service.json> [output.ts]")

    config_path = sys.argv[1]
    c = load_config(config_path)
    validate_config(c)

    doc  = build_openapi(c)
    ts   = emit_typescript(doc, c)

    # Output path: same dir as config, named {name}-openapi.ts, or argv[2]
    if len(sys.argv) >= 3:
        out_path = sys.argv[2]
    else:
        out_dir  = Path(config_path).parent
        out_path = out_dir / f"{c['name']}-openapi.ts"

    with open(out_path, "w") as f:
        f.write(ts)

    print(f"✓  OpenAPI discovery module → {out_path}")
    print(f"   {len(doc['paths'])} paths ({len(c['endpoints'])} gated + free)")
    print()
    print("Next steps:")
    print(f"  1. Copy {out_path} into your src/ directory")
    print(f"  2. Import and mount:  app.get('/openapi.json', (_req,res)=>{{ res.setHeader('Cache-Control','max-age=300'); res.json(openApiDoc); }});")
    print(f"  3. Rebuild + deploy")
    print(f"  4. Run: bash .agents/skills/x402-publish/scripts/validate_compliance.sh {c['baseUrl']}")

if __name__ == "__main__":
    main()
