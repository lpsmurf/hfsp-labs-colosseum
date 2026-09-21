#!/usr/bin/env python3
"""Dump a single Sumsub OpenAPI operation: params, request body, responses.

Usage:
    show_endpoint.py GET /resources/applicants/{applicantId}/one
    show_endpoint.py POST /resources/accessTokens

Resolves $ref pointers two levels deep so you can see the actual shape without
chasing references manually. For deeper nested refs you'll still need to look
them up in the schema.

The schema is auto-fetched and cached (24 h TTL) — see _schema_cache.py for
the cache location and env-var knobs.
"""

from __future__ import annotations

import json
import sys
from typing import Any

from _schema_cache import load_schema


def _resolve(schema: dict[str, Any], ref: str) -> Any:
    # Only #/-style local refs; OpenAPI doesn't use anything else here.
    if not ref.startswith("#/"):
        return {"$ref": ref}
    node: Any = schema
    for part in ref[2:].split("/"):
        try:
            node = node[part]
        except (KeyError, TypeError) as exc:
            raise KeyError(f"could not resolve $ref {ref!r}: missing segment {part!r}") from exc
    return node


def _inline_refs(schema: dict[str, Any], node: Any, depth: int = 1) -> Any:
    if depth < 0:
        return node
    if isinstance(node, dict):
        if "$ref" in node and isinstance(node["$ref"], str):
            target = _resolve(schema, node["$ref"])
            return _inline_refs(schema, target, depth - 1)
        return {k: _inline_refs(schema, v, depth) for k, v in node.items()}
    if isinstance(node, list):
        return [_inline_refs(schema, x, depth) for x in node]
    return node


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2

    method = sys.argv[1].lower()
    path = sys.argv[2]

    schema = load_schema()
    paths = schema.get("paths", {})

    if path not in paths:
        print(f"path not found: {path}", file=sys.stderr)
        # Best-effort hint: list similar paths.
        prefix = path.rstrip("/").rsplit("/", 1)[0]
        similar = [p for p in paths if p.startswith(prefix)][:10]
        if similar:
            print("similar paths:", file=sys.stderr)
            for s in similar:
                print("  " + s, file=sys.stderr)
        return 1

    ops = paths[path]
    if method not in ops:
        print(f"{method.upper()} not defined on {path}", file=sys.stderr)
        print("defined methods: " + ", ".join(m.upper() for m in ops), file=sys.stderr)
        return 1

    op = ops[method]
    out = {
        "method": method.upper(),
        "path": path,
        "summary": op.get("summary"),
        "description": op.get("description"),
        "operationId": op.get("operationId"),
        "tags": op.get("tags"),
        "parameters": _inline_refs(schema, op.get("parameters", []), depth=2),
        "requestBody": _inline_refs(schema, op.get("requestBody"), depth=2),
        "responses": _inline_refs(schema, op.get("responses"), depth=2),
        "security": op.get("security"),
    }
    json.dump(out, sys.stdout, indent=2, ensure_ascii=False)
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
