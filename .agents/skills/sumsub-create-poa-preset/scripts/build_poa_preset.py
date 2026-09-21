#!/usr/bin/env python3
"""
Expand a compact POA preset spec (JSON or YAML on stdin) into a full Sumsub
`PoaStepSettings` payload (JSON on stdout).

YAML support requires PyYAML (`pip install pyyaml`). If PyYAML is not
installed, only JSON input is accepted.

See SKILL.md for the spec format. The builder:
- maps `providers.<kind>` to `allowedTypesSettings[<kind>]` (PoaCompanyContactType)
- maps `poiAsPoa` to `poiAsPoaSettings`
- maps `crossValidator` to `crossValidatorSettings`
- propagates `validMonths` defaults into providers that don't set their own
- validates all enum values upfront
- applies the same expansion to each entry under `byCountry`
"""
import json
import re
import sys
from typing import Any

try:
    import yaml  # type: ignore
    _HAS_YAML = True
except ImportError:
    _HAS_YAML = False


def _load_spec(stream):
    """Parse stdin as YAML (which is a JSON superset) if PyYAML is available;
    otherwise fall back to JSON. On parse failure, surface a helpful error."""
    data = stream.read()
    if _HAS_YAML:
        try:
            return yaml.safe_load(data)
        except yaml.YAMLError as e:
            print(f"error: failed to parse spec as YAML/JSON: {e}", file=sys.stderr)
            sys.exit(2)
    try:
        return json.loads(data)
    except json.JSONDecodeError as e:
        print(f"error: failed to parse spec as JSON: {e}", file=sys.stderr)
        print("hint: install PyYAML (`pip install pyyaml`) to accept YAML input.", file=sys.stderr)
        sys.exit(2)

PROVIDER_TYPES = {"bank", "utilityProvider", "governmentOrganization", "mobileOperator", "other"}
POA_SUB_TYPES = {
    "statement", "voterRegistration", "taxBill", "telecom", "utilityBill",
    "bankStatement", "bankLetter", "lease", "universityLetter",
    "employmentLetter", "other",
}
ADDRESS_TYPES = {"dwelling", "poBox", "poBoxSpecialCountries"}
POI_DOC_TYPES = {
    "PASSPORT", "ID_CARD", "RESIDENCE_PERMIT", "DRIVERS",
    "VISA", "OTHER",
}
NAME_MODES = {"strict", "weakContainment", "def", "ai", "fuzzy", "containment", "fuzzyContainment"}
ADDRESS_MODES = {"strict", "fuzzy"}
ISO3_RE = re.compile(r"^[A-Z]{3}$")


def _ensure_enum(value, allowed, label):
    if value is None:
        return None
    if value not in allowed:
        raise ValueError(f"{label}: {value!r} not in {sorted(allowed)}")
    return value


def _ensure_iso3_list(values, label):
    if values is None:
        return None
    out = []
    for c in values:
        if not isinstance(c, str) or not ISO3_RE.fullmatch(c):
            raise ValueError(f"{label}: expected ISO-3166-1 alpha-3 uppercase, got {c!r}")
        out.append(c)
    return out


def _ensure_list_of(allowed, values, label):
    if values is None:
        return None
    bad = [v for v in values if v not in allowed]
    if bad:
        raise ValueError(f"{label}: invalid values {bad!r}; allowed: {sorted(allowed)}")
    return list(values)


def _build_provider(kind, spec, default_valid_months):
    """Compact provider settings -> PoaTypeSettings."""
    if not isinstance(spec, dict):
        raise ValueError(f"providers.{kind}: must be an object; got {type(spec).__name__}")
    out = {}

    valid_months = spec.get("validMonths", default_valid_months)
    if valid_months is not None:
        out["validMonths"] = float(valid_months)

    if "acceptUnconventional" in spec:
        out["acceptUnconventionalProviders"] = bool(spec["acceptUnconventional"])
    elif "acceptUnconventionalProviders" in spec:
        out["acceptUnconventionalProviders"] = bool(spec["acceptUnconventionalProviders"])

    if "subTypes" in spec:
        out["allowedSubTypes"] = _ensure_list_of(
            POA_SUB_TYPES, spec["subTypes"], f"providers.{kind}.subTypes"
        )

    for k in ("forbiddenDocumentNames", "forbiddenOrgNames", "forbiddenOrgWebsites"):
        if spec.get(k) is not None:
            if not isinstance(spec[k], list):
                raise ValueError(f"providers.{kind}.{k} must be a list, got {type(spec[k]).__name__}")
            out[k] = list(spec[k])

    allowed_orgs = spec.get("allowedOrgs") or {}
    if allowed_orgs and not isinstance(allowed_orgs, dict):
        raise ValueError(f"providers.{kind}.allowedOrgs must be an object, got {type(allowed_orgs).__name__}")
    if allowed_orgs:
        pu = {}
        if allowed_orgs.get("names"):
            pu["allowedOrgNames"] = list(allowed_orgs["names"])
        if allowed_orgs.get("websites"):
            pu["allowedOrgWebsites"] = list(allowed_orgs["websites"])
        if pu:
            out["poaUnconventionalProviderSettings"] = pu

    # pass-through escape hatch for any other key
    handled = {
        "validMonths", "acceptUnconventional", "acceptUnconventionalProviders",
        "subTypes", "forbiddenDocumentNames", "forbiddenOrgNames",
        "forbiddenOrgWebsites", "allowedOrgs",
    }
    for k, v in spec.items():
        if k in handled or v is None:
            continue
        out[k] = v
    return out


def _build_poi_as_poa(spec):
    if spec is None:
        return None
    if not isinstance(spec, dict):
        raise ValueError(f"poiAsPoa: must be an object; got {type(spec).__name__}")
    out = {}
    if "enabled" in spec:
        out["acceptPoiAsPoa"] = bool(spec["enabled"])
    elif "acceptPoiAsPoa" in spec:
        out["acceptPoiAsPoa"] = bool(spec["acceptPoiAsPoa"])
    if "sameDoc" in spec:
        out["acceptSamePoiAsPoa"] = bool(spec["sameDoc"])
    elif "acceptSamePoiAsPoa" in spec:
        out["acceptSamePoiAsPoa"] = bool(spec["acceptSamePoiAsPoa"])
    if "validMonths" in spec and spec["validMonths"] is not None:
        out["validMonths"] = float(spec["validMonths"])
    if "allowedTypes" in spec and spec["allowedTypes"] is not None:
        out["allowedTypes"] = _ensure_list_of(POI_DOC_TYPES, spec["allowedTypes"], "poiAsPoa.allowedTypes")
    return out or None


def _build_cross_validator(spec):
    if spec is None:
        return None
    if not isinstance(spec, dict):
        raise ValueError(f"crossValidator: must be an object; got {type(spec).__name__}")
    out = {}
    if "nameMode" in spec:
        out["nameComparisonMode"] = _ensure_enum(spec["nameMode"], NAME_MODES, "crossValidator.nameMode")
    elif "nameComparisonMode" in spec:
        out["nameComparisonMode"] = _ensure_enum(spec["nameComparisonMode"], NAME_MODES, "crossValidator.nameComparisonMode")
    if "addressMode" in spec:
        out["addressComparisonMode"] = _ensure_enum(spec["addressMode"], ADDRESS_MODES, "crossValidator.addressMode")
    elif "addressComparisonMode" in spec:
        out["addressComparisonMode"] = _ensure_enum(spec["addressComparisonMode"], ADDRESS_MODES, "crossValidator.addressComparisonMode")
    if "fuzzyThreshold" in spec and spec["fuzzyThreshold"] is not None:
        ft = float(spec["fuzzyThreshold"])
        if not (0.0 <= ft <= 1.0):
            raise ValueError(f"crossValidator.fuzzyThreshold: must be in [0,1]; got {ft}")
        out["fuzzyThreshold"] = ft
    if "ignoreMiddleName" in spec:
        out["ignoreMiddleNameMismatch"] = bool(spec["ignoreMiddleName"])
    elif "ignoreMiddleNameMismatch" in spec:
        out["ignoreMiddleNameMismatch"] = bool(spec["ignoreMiddleNameMismatch"])
    if "ignoreFixedInfo" in spec:
        out["ignoreFixedInfo"] = bool(spec["ignoreFixedInfo"])
    return out or None


def _build_doc_settings(spec, *, label="settings"):
    """Compact PoaDocumentSettings -> full PoaDocumentSettings."""
    if spec is None:
        return None
    if not isinstance(spec, dict):
        raise ValueError(f"{label}: must be an object; got {type(spec).__name__}")

    out = {}

    default_vm = spec.get("validMonths")
    if default_vm is not None:
        # not a real PoaDocumentSettings field — drop after using as default
        default_vm = float(default_vm)

    if "acceptDocScreenshot" in spec:
        out["acceptDocScreenshot"] = bool(spec["acceptDocScreenshot"])
    if "acceptMultiplePages" in spec:
        out["acceptMultiplePages"] = bool(spec["acceptMultiplePages"])
    if "acceptableLanguages" in spec and spec["acceptableLanguages"] is not None:
        out["acceptableLanguages"] = list(spec["acceptableLanguages"])

    addr_types = spec.get("addressTypes")
    if addr_types is None:
        addr_types = spec.get("allowedAddressTypes")
    if addr_types is not None:
        out["allowedAddressTypes"] = _ensure_list_of(ADDRESS_TYPES, addr_types, f"{label}.addressTypes")

    providers_in = spec.get("providers") or spec.get("allowedTypesSettings") or {}
    if providers_in:
        bad = [k for k in providers_in if k not in PROVIDER_TYPES]
        if bad:
            raise ValueError(f"{label}.providers: unknown provider keys {bad!r}; allowed: {sorted(PROVIDER_TYPES)}")
        out["allowedTypesSettings"] = {
            k: _build_provider(k, providers_in[k], default_vm) for k in providers_in
        }

    cv = _build_cross_validator(spec.get("crossValidator") or spec.get("crossValidatorSettings"))
    if cv is not None:
        out["crossValidatorSettings"] = cv

    pp = _build_poi_as_poa(spec.get("poiAsPoa") or spec.get("poiAsPoaSettings"))
    if pp is not None:
        out["poiAsPoaSettings"] = pp

    if "requireCountryMatch" in spec:
        out["requirePoiPoaCountryMatch"] = bool(spec["requireCountryMatch"])
    elif "requirePoiPoaCountryMatch" in spec:
        out["requirePoiPoaCountryMatch"] = bool(spec["requirePoiPoaCountryMatch"])

    if "useIssueDateForExpiry" in spec:
        out["useOnlyIssueDateForExpiredCheck"] = bool(spec["useIssueDateForExpiry"])
    elif "useOnlyIssueDateForExpiredCheck" in spec:
        out["useOnlyIssueDateForExpiredCheck"] = bool(spec["useOnlyIssueDateForExpiredCheck"])

    # pass-through escape hatch
    handled = {
        "validMonths", "acceptDocScreenshot", "acceptMultiplePages",
        "acceptableLanguages", "addressTypes", "allowedAddressTypes",
        "providers", "allowedTypesSettings", "crossValidator", "crossValidatorSettings",
        "poiAsPoa", "poiAsPoaSettings", "requireCountryMatch",
        "requirePoiPoaCountryMatch", "useIssueDateForExpiry",
        "useOnlyIssueDateForExpiredCheck",
    }
    for k, v in spec.items():
        if k in handled or v is None:
            continue
        out[k] = v
    return out


def build_poa_preset(spec):
    if not isinstance(spec, dict):
        raise ValueError(f"preset spec must be an object; got {type(spec).__name__}")
    name = (spec.get("name") or "").strip()
    if not name:
        raise ValueError("preset spec must have a non-empty 'name'")

    inc = _ensure_iso3_list(spec.get("includedCountries"), "includedCountries")
    exc = _ensure_iso3_list(spec.get("excludedCountries"), "excludedCountries")
    if inc and exc:
        raise ValueError("set only ONE of includedCountries / excludedCountries, not both")

    payload = {"name": name}
    if spec.get("desc"):
        payload["desc"] = spec["desc"]
    if inc:
        payload["includedCountries"] = inc
    if exc:
        payload["excludedCountries"] = exc

    settings = _build_doc_settings(spec.get("settings"), label="settings")
    if settings is not None:
        payload["settings"] = settings

    by_country = spec.get("byCountry") or {}
    if by_country:
        if not isinstance(by_country, dict):
            raise ValueError(f"byCountry: must be a map; got {type(by_country).__name__}")
        # validate ISO-3 keys
        bad = [k for k in by_country if not ISO3_RE.fullmatch(str(k))]
        if bad:
            raise ValueError(f"byCountry: invalid country keys {bad!r}; expected ISO-3 uppercase")
        payload["changedSettingsByCountry"] = {
            k: _build_doc_settings(v, label=f"byCountry.{k}") for k, v in by_country.items()
        }

    # pass-through escape hatch for top-level keys
    handled = {
        "name", "desc", "includedCountries", "excludedCountries",
        "settings", "byCountry", "changedSettingsByCountry",
    }
    for k, v in spec.items():
        if k in handled or v is None:
            continue
        payload[k] = v

    return payload


def main():
    spec = _load_spec(sys.stdin)
    payload = build_poa_preset(spec)
    json.dump(payload, sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
