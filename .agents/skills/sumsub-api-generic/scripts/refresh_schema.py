#!/usr/bin/env python3
"""Force-refresh the local Sumsub OpenAPI schema cache.

Equivalent to `SUMSUB_SCHEMA_REFRESH=1 ./find_endpoint.py <anything>`, but
prints a friendly summary of what landed.

Use when you know a new endpoint shipped and don't want to wait for the
24-hour TTL to expire.
"""

from __future__ import annotations

import os
import sys

os.environ["SUMSUB_SCHEMA_REFRESH"] = "1"

from _schema_cache import cache_path, load_schema, schema_url

schema = load_schema()
path = cache_path()
paths = len(schema.get("paths", {}))
schemas = len(schema.get("components", {}).get("schemas", {}))
size = path.stat().st_size

print(
    f"OK — refreshed from {schema_url()}\n"
    f"     cached at {path}\n"
    f"     {paths} paths, {schemas} schemas, {size:,} bytes",
    file=sys.stderr,
)
