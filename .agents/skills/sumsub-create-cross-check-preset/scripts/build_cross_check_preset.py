#!/usr/bin/env python3
"""Build a Sumsub cross-check preset payload from a compact spec.

Reads YAML or JSON from stdin, writes the full POST/PATCH payload to stdout.

Usage:
    cat spec.yaml | build_cross_check_preset.py > payload.json
    build_cross_check_preset.py < spec.json > payload.json

The spec is intentionally minimal — most clients should use Sumsub's
default cross-check preset and not call this skill at all. Override only
when there's a specific named tweak.
"""

from __future__ import annotations

import json
import sys
from typing import Any

NAME_MODES = {"strict", "weakContainment", "def", "ai"}
ADDRESS_MODES = {"strict", "fuzzy"}
MODES = {"basic", "advanced"}


def _load(stream) -> Any:
    text = stream.read()
    if not text.strip():
        sys.exit("error: empty stdin")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        try:
            import yaml  # type: ignore
        except ImportError:
            sys.exit("error: input is not JSON, and PyYAML is not installed")
        return yaml.safe_load(text)


def _err(msg: str) -> None:
    sys.exit(f"error: {msg}")


def build(spec: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(spec, dict):
        _err("spec must be an object/mapping")

    title = spec.get("title")
    if not isinstance(title, str) or not title.strip():
        _err("`title` is required and must be a non-empty string")
    if len(title) > 256:
        _err("`title` must be ≤256 chars")

    description = spec.get("description")
    if description is not None and not isinstance(description, str):
        _err("`description` must be a string if provided")
    if isinstance(description, str) and len(description) > 512:
        _err("`description` must be ≤512 chars")

    mode = spec.get("mode", "basic")
    if mode not in MODES:
        _err(f"`mode` must be one of {sorted(MODES)} (got {mode!r})")
    if mode == "advanced":
        _err(
            "`mode: advanced` is rejected by the public API "
            "(only the dashboard can manage advanced presets)"
        )

    settings_in = spec.get("basicSettings") or {}
    if not isinstance(settings_in, dict):
        _err("`basicSettings` must be an object if provided")

    name_mode = settings_in.get("nameComparisonMode")
    if name_mode is not None and name_mode not in NAME_MODES:
        _err(
            f"`basicSettings.nameComparisonMode` must be one of "
            f"{sorted(NAME_MODES)} (got {name_mode!r}). "
            f"Deprecated values (fuzzy/containment/fuzzyContainment) are not accepted."
        )

    address_mode = settings_in.get("addressComparisonMode")
    if address_mode is not None and address_mode not in ADDRESS_MODES:
        _err(
            f"`basicSettings.addressComparisonMode` must be one of "
            f"{sorted(ADDRESS_MODES)} (got {address_mode!r})"
        )

    ignore_middle = settings_in.get("ignoreMiddleNameMismatch")
    if ignore_middle is not None and not isinstance(ignore_middle, bool):
        _err("`basicSettings.ignoreMiddleNameMismatch` must be a boolean")

    ignore_provided = settings_in.get("ignoreProvidedInfoMismatch")
    if ignore_provided is not None and not isinstance(ignore_provided, bool):
        _err("`basicSettings.ignoreProvidedInfoMismatch` must be a boolean")

    basic_settings: dict[str, Any] = {}
    if name_mode is not None:
        basic_settings["nameComparisonMode"] = name_mode
    if address_mode is not None:
        basic_settings["addressComparisonMode"] = address_mode
    if ignore_middle is not None:
        basic_settings["ignoreMiddleNameMismatch"] = ignore_middle
    if ignore_provided is not None:
        basic_settings["ignoreProvidedInfoMismatch"] = ignore_provided

    payload: dict[str, Any] = {
        "title": title,
        "mode": mode,
    }
    if description:
        payload["description"] = description
    if basic_settings:
        payload["basicSettings"] = basic_settings

    spec_id = spec.get("id")
    if spec_id is not None:
        if not isinstance(spec_id, str) or not spec_id.strip():
            _err("`id` must be a non-empty string if provided")
        payload["id"] = spec_id

    return payload


def main() -> int:
    spec = _load(sys.stdin)
    payload = build(spec)
    json.dump(payload, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
