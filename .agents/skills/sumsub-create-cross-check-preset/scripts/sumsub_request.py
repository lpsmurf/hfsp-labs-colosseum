#!/usr/bin/env python3
"""Perform a Sumsub API request without exposing secrets on argv.

Usage: SUMSUB_APP_TOKEN=... SUMSUB_SECRET_KEY=... python3 sumsub_request.py METHOD PATH PAYLOAD

Prints the response body followed by a final line: HTTP <code>
"""
import sys
import os
import time
import hmac
import hashlib
import urllib.request
import urllib.error
from urllib.parse import urlparse


def main():
    if len(sys.argv) != 4:
        print("usage: sumsub_request.py METHOD PATH PAYLOAD", file=sys.stderr)
        return 2

    method, path, payload = sys.argv[1], sys.argv[2], sys.argv[3]
    secret = os.environ.get("SUMSUB_SECRET_KEY")
    token = os.environ.get("SUMSUB_APP_TOKEN")
    base = os.environ.get("SUMSUB_BASE", "https://api.sumsub.com")

    if not secret or not token:
        print("error: SUMSUB_APP_TOKEN and SUMSUB_SECRET_KEY must be set in the environment", file=sys.stderr)
        return 2

    # Validate SUMSUB_BASE — credentials must only ever be sent to a Sumsub HTTPS host.
    parsed_base = urlparse(base)
    if parsed_base.scheme != "https" or not (
        parsed_base.hostname == "sumsub.com" or (parsed_base.hostname or "").endswith(".sumsub.com")
    ):
        print(f"error: SUMSUB_BASE must be an https://*.sumsub.com URL (got {base!r})", file=sys.stderr)
        return 2

    ts = str(int(time.time()))
    try:
        with open(payload, "rb") as f:
            body = f.read()
    except Exception as e:
        print(f"error: cannot read payload: {e}", file=sys.stderr)
        return 2

    to_sign = ts + method.upper() + path
    data = to_sign.encode("utf8") + body
    sig = hmac.new(secret.encode("utf8"), data, hashlib.sha256).hexdigest()

    url = base.rstrip("/") + path
    headers = {
        "X-App-Token": token,
        "X-App-Access-Ts": ts,
        "X-App-Access-Sig": sig,
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Agent-Source": "sumsub-skills",
        "X-Agent-Source-Ver": "1.0.1",
    }

    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            resp_body = resp.read()
            try:
                print(resp_body.decode("utf8"))
            except Exception:
                # binary body fallback
                sys.stdout.buffer.write(resp_body)
                print()
            print(f"HTTP {resp.status}")
            return 0
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf8", errors="replace")
            print(body)
        except Exception:
            print(f"HTTP error {e.code}")
        print(f"HTTP {e.code}")
        return 1
    except Exception as e:
        print(f"request error: {e}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
