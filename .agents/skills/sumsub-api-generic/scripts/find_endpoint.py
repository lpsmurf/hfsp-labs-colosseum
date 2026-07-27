#!/usr/bin/env python3
"""Search the Sumsub OpenAPI schema for endpoints matching keywords.

Each positional argument is a keyword that must appear (case-insensitive) in
the path, the summary, the tags, or the operationId. Multi-word AND match —
narrow as you go.

Usage:
    find_endpoint.py applicants tags
    find_endpoint.py accessTokens
    find_endpoint.py POST applicants     # mix HTTP method and keywords

The schema is auto-fetched and cached (24 h TTL) — see _schema_cache.py for
the cache location and env-var knobs.
"""

from __future__ import annotations

import sys

from _schema_cache import load_schema

METHODS = {"get", "post", "put", "patch", "delete", "options", "head"}


def main() -> int:
    args = [a.lower() for a in sys.argv[1:]]
    if not args:
        print(__doc__, file=sys.stderr)
        return 2

    method_filters = {a for a in args if a in METHODS}
    keyword_filters = [a for a in args if a not in METHODS]

    schema = load_schema()
    paths = schema.get("paths", {})

    rows: list[tuple[str, str, str, str]] = []
    for path, ops in paths.items():
        for method, op in ops.items():
            if method.lower() not in METHODS:
                continue
            if method_filters and method.lower() not in method_filters:
                continue
            summary = (op.get("summary") or "").strip()
            tags = ", ".join(op.get("tags") or [])
            op_id = (op.get("operationId") or "").strip()
            hay = f"{path}\n{summary}\n{tags}\n{op_id}".lower()
            if all(kw in hay for kw in keyword_filters):
                rows.append((method.upper(), path, summary, op_id))

    if not rows:
        print("(no matches)", file=sys.stderr)
        return 1

    rows.sort(key=lambda r: (r[1], r[0]))
    width = max(len(m) for m, *_ in rows)
    for method, path, summary, op_id in rows:
        line = f"{method.ljust(width)}  {path}"
        if summary:
            line += f"  — {summary}"
        if op_id:
            line += f"  ({op_id})"
        print(line)
    print(f"\n{len(rows)} match(es)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
