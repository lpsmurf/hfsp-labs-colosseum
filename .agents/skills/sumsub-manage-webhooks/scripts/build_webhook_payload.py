#!/usr/bin/env python3
"""
Expand a compact webhook spec (JSON on stdin) into a full Sumsub `ClientWebhook`
payload (JSON on stdout) suitable for POST /resources/clientWebhooks.

The same payload covers both create (no `id`) and update (with `id`); the
endpoint dispatches by presence/absence of `id`.
"""
import ipaddress
import json
import sys
from urllib.parse import urlparse

TARGET_TYPES = {"http", "email", "slack", "telegram"}
SIGNATURE_ALGOS = {"HMAC_SHA1_HEX", "HMAC_SHA256_HEX", "HMAC_SHA512_HEX"}
APPLICANT_TYPES = {"individual", "company"}

# Hostnames Sumsub's infrastructure cannot reach. Webhook delivery would
# silently fail forever, so reject up front and point the caller at a tunnel.
_LOCAL_HOSTNAMES = {"localhost", "ip6-localhost", "ip6-loopback"}


def _is_local_target(url: str) -> bool:
    try:
        host = (urlparse(url).hostname or "").lower()
    except ValueError:
        return False
    if not host:
        return False
    host = host.strip("[]")
    if host in _LOCAL_HOSTNAMES:
        return True
    # Reject any non-public IP literal (loopback, private, link-local, reserved).
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False  # a regular hostname — assume publicly routable
    return (
        ip.is_loopback or ip.is_private or ip.is_link_local
        or ip.is_reserved or ip.is_unspecified or ip.is_multicast
    )


def _enum(value, allowed, label):
    if value is None:
        return None
    if value not in allowed:
        raise ValueError(f"{label}: {value!r} not in {sorted(allowed)}")
    return value


def build(spec):
    if not isinstance(spec, dict):
        raise ValueError(f"spec must be an object; got {type(spec).__name__}")

    name = spec.get("name")
    if not isinstance(name, str) or not name.strip():
        raise ValueError("name is required (non-empty string)")
    name = name.strip()

    target = spec.get("target")
    if not isinstance(target, str) or not target.strip():
        raise ValueError("target is required (URL for http; address for other targetTypes)")
    target = target.strip()

    target_type = spec.get("targetType", "http")
    if target_type == "http" and _is_local_target(target):
        raise ValueError(
            f"target {target!r} points at localhost / loopback — Sumsub cannot reach it from "
            "its own infrastructure, so every delivery will silently fail. Expose the local "
            "receiver through a public tunnel (e.g. `ngrok http <port>`, Cloudflare Tunnel, "
            "Tailscale Funnel) and re-run with the public https:// URL as `target`."
        )

    types = spec.get("types")
    if not isinstance(types, list) or not types:
        raise ValueError("types must be a non-empty list of event-type strings")
    bad = [t for t in types if not isinstance(t, str) or not t.strip()]
    if bad:
        raise ValueError(f"types contains non-string or empty entries: {bad!r}")

    out = {
        "name": name,
        "target": target,
        "targetType": _enum(spec.get("targetType", "http"), TARGET_TYPES, "targetType"),
        "types": [t.strip() for t in types],
    }

    if spec.get("id") is not None:
        out["id"] = spec["id"]
    if spec.get("description") is not None:
        out["description"] = spec["description"]
    if spec.get("applicantType") is not None:
        out["applicantType"] = _enum(spec["applicantType"], APPLICANT_TYPES, "applicantType")
    if spec.get("sourceKeys") is not None:
        if not isinstance(spec["sourceKeys"], list):
            raise ValueError("sourceKeys must be a list of strings")
        if not all(isinstance(k, str) for k in spec["sourceKeys"]):
            raise ValueError("sourceKeys must contain only strings")
        out["sourceKeys"] = list(spec["sourceKeys"])

    if spec.get("secretKey") is not None:
        if not isinstance(spec["secretKey"], str):
            raise ValueError("secretKey must be a string")
        out["secretKey"] = spec["secretKey"]

    sig = spec.get("signatureAlgorithm", "HMAC_SHA256_HEX")
    out["signatureAlgorithm"] = _enum(sig, SIGNATURE_ALGOS, "signatureAlgorithm")

    headers = spec.get("headers")
    if headers is not None:
        if not isinstance(headers, list):
            raise ValueError("headers must be a list of {key, value} objects")
        cleaned = []
        for h in headers:
            if not isinstance(h, dict) or "key" not in h or "value" not in h:
                raise ValueError(f"each header must be {{key, value}}; got {h!r}")
            cleaned.append({"key": str(h["key"]), "value": str(h["value"])})
        out["headers"] = cleaned

    for flag in ("disabled", "notResendFailedWebhooks"):
        if flag in spec and spec[flag] is not None:
            if not isinstance(spec[flag], bool):
                raise ValueError(f"{flag} must be a boolean (true/false), got {type(spec[flag]).__name__}")
            out[flag] = spec[flag]

    # Pass-through escape hatch for any other key (e.g. an obscure field added by Sumsub later).
    handled = {
        "id", "name", "target", "targetType", "types", "description",
        "applicantType", "sourceKeys", "secretKey", "signatureAlgorithm",
        "headers", "disabled", "notResendFailedWebhooks",
    }
    for k, v in spec.items():
        if k in handled or v is None:
            continue
        out[k] = v

    return out


def main():
    spec = json.load(sys.stdin)
    json.dump(build(spec), sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
