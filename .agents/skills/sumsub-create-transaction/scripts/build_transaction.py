#!/usr/bin/env python3
"""
Expand a compact KYT-transaction spec (JSON on stdin) into a full Sumsub
`KytTxnData` payload (JSON on stdout).

Spec format: see SKILL.md. The two underscore-prefixed keys `_applicantId` and
`_levelName` control routing in post_transaction.sh and are stripped from the
emitted payload — they're stored in a sidecar file (path supplied via env
`SUMSUB_TXN_ROUTE_FILE`) so the post script can pick the right URL.
"""
import json
import os
import sys

TOP_TYPES = {"finance", "travelRule", "kyc", "auditTrailEvent",
             "userPlatformEvent", "scheduledEvent", "iGamingSession"}
DIRECTIONS = {"in", "out"}
CURRENCY_TYPES = {"crypto", "fiat"}
APPLICANT_TYPES = {"individual", "company"}
NAME_TYPES = {"aliasName", "birthName", "maidenName", "legalName", "shortName", "tradingName", "other"}
USER_PLATFORM_EVENT_TYPES = {"login", "failedLogin", "signup", "passwordReset", "twoFaReset", "general"}


def _enum(value, allowed, label):
    if value is None:
        return None
    if value not in allowed:
        raise ValueError(f"{label}: {value!r} not in {sorted(allowed)}")
    return value


def _build_address(addr):
    if addr is None:
        return None
    if not isinstance(addr, dict):
        raise ValueError(f"address must be an object; got {type(addr).__name__}")
    out = {}
    for k in ("country", "postCode", "town", "street", "subStreet", "state",
              "buildingName", "flatNumber", "buildingNumber"):
        if addr.get(k) is not None:
            out[k] = addr[k]
    if addr.get("formatted") is not None:
        out["formattedAddress"] = addr["formatted"]
    elif addr.get("formattedAddress") is not None:
        out["formattedAddress"] = addr["formattedAddress"]
    return out or None


def _build_payment_method(pm):
    if pm is None:
        return None
    if not isinstance(pm, dict):
        raise ValueError(f"paymentMethod must be an object; got {type(pm).__name__}")
    out = {}
    for k in ("type", "accountId", "accountIdHash", "issuingCountry",
              "subType", "memo", "fingerprint", "3dsUsed", "2faUsed"):
        if pm.get(k) is not None:
            out[k] = pm[k]
    return out or None


def _build_device(dev):
    if dev is None:
        return None
    if not isinstance(dev, dict):
        raise ValueError(f"device must be an object; got {type(dev).__name__}")
    out = {}
    for k in ("userAgent", "sessionId", "sessionAgeMs", "acceptLang",
              "fingerprint", "deviceBindingId"):
        if dev.get(k) is not None:
            out[k] = dev[k]
    addr = _build_address(dev.get("address"))
    if addr:
        out["address"] = addr
    if dev.get("coords") is not None:
        out["coords"] = dev["coords"]
    if dev.get("ipInfo") is not None:
        out["ipInfo"] = dev["ipInfo"]
    return out or None


def _build_id_doc(doc):
    if doc is None:
        return None
    if not isinstance(doc, dict):
        raise ValueError(f"idDoc must be an object; got {type(doc).__name__}")
    out = {}
    for k in ("number", "country", "idDocType", "registrationAuthority"):
        if doc.get(k) is not None:
            out[k] = doc[k]
    return out or None


def _build_institution(ins):
    if ins is None:
        return None
    if not isinstance(ins, dict):
        raise ValueError(f"institution must be an object; got {type(ins).__name__}")
    out = {}
    for k in ("code", "name", "internalId"):
        if ins.get(k) is not None:
            out[k] = ins[k]
    addr = _build_address(ins.get("address"))
    if addr:
        out["address"] = addr
    return out or None


def _build_name_obj(n, label):
    if n is None:
        return None
    if not isinstance(n, dict):
        raise ValueError(f"{label} must be an object; got {type(n).__name__}")
    out = {}
    for k in ("firstName", "firstNameEn", "lastName", "lastNameEn"):
        if n.get(k) is not None:
            out[k] = n[k]
    if n.get("nameType") is not None:
        out["nameType"] = _enum(n["nameType"], NAME_TYPES, f"{label}.nameType")
    return out or None


def _build_participant(spec, *, label, require_external_id):
    if spec is None:
        return None
    if not isinstance(spec, dict):
        raise ValueError(f"{label} must be an object; got {type(spec).__name__}")

    out = {}
    ext = spec.get("externalUserId")
    if require_external_id and not ext:
        raise ValueError(f"{label}.externalUserId is required")
    if ext is not None:
        out["externalUserId"] = ext

    if spec.get("type") is not None:
        out["type"] = _enum(spec["type"], APPLICANT_TYPES, f"{label}.type")

    for k in ("fullName", "fullNameEn", "firstName", "firstNameEn",
              "lastName", "lastNameEn", "dob", "email", "phone",
              "placeOfBirth", "registrationNumber", "leiCode",
              "licenseNumber", "residenceCountry", "companyType"):
        if spec.get(k) is not None:
            out[k] = spec[k]

    if spec.get("nameType") is not None:
        out["nameType"] = _enum(spec["nameType"], NAME_TYPES, f"{label}.nameType")

    addr = _build_address(spec.get("address"))
    if addr:
        out["address"] = addr

    pm = _build_payment_method(spec.get("paymentMethod"))
    if pm:
        out["paymentMethod"] = pm

    dev = _build_device(spec.get("device"))
    if dev:
        out["device"] = dev

    doc = _build_id_doc(spec.get("idDoc"))
    if doc:
        out["idDoc"] = doc

    ins = _build_institution(spec.get("institution") or spec.get("institutionInfo"))
    if ins:
        out["institutionInfo"] = ins

    ceo = _build_name_obj(spec.get("ceo"), f"{label}.ceo")
    if ceo:
        out["ceo"] = ceo

    return out


def _build_info(spec):
    """Map top-level amount/currency/direction/etc + crypto.* into KytTxnInfo."""
    out = {}
    if spec.get("amount") is not None:
        out["amount"] = float(spec["amount"])
    if spec.get("amountInDefaultCurrency") is not None:
        out["amountInDefaultCurrency"] = float(spec["amountInDefaultCurrency"])
    if spec.get("currency") is not None:
        out["currencyCode"] = spec["currency"]
    elif spec.get("currencyCode") is not None:
        out["currencyCode"] = spec["currencyCode"]
    if spec.get("defaultCurrencyCode") is not None:
        out["defaultCurrencyCode"] = spec["defaultCurrencyCode"]
    if spec.get("currencyType") is not None:
        out["currencyType"] = _enum(spec["currencyType"], CURRENCY_TYPES, "currencyType")
    if spec.get("direction") is not None:
        out["direction"] = _enum(spec["direction"], DIRECTIONS, "direction")
    if spec.get("paymentDetails") is not None:
        out["paymentDetails"] = spec["paymentDetails"]
    if spec.get("paymentTxnId") is not None:
        out["paymentTxnId"] = spec["paymentTxnId"]
    if spec.get("mcc") is not None:
        out["mcc"] = int(spec["mcc"])
    if spec.get("infoType") is not None:
        # caller-supplied free-form txn categorization ("payroll", "bonus", etc.)
        out["type"] = spec["infoType"]

    crypto = spec.get("crypto")
    if crypto is not None:
        if not isinstance(crypto, dict):
            raise ValueError(f"crypto must be an object; got {type(crypto).__name__}")
        cp = {}
        for k_in, k_out in (("chain", "cryptoChain"), ("contract", "contractAddress"),
                            ("attemptId", "attemptId"), ("outputIndex", "outputIndex")):
            if crypto.get(k_in) is not None:
                cp[k_out] = crypto[k_in]
        if cp:
            out["cryptoParams"] = cp
        if crypto.get("paymentTxnId") is not None:
            out["paymentTxnId"] = crypto["paymentTxnId"]
        if crypto.get("fingerprint") is not None:
            out["fingerprint"] = crypto["fingerprint"]

    return out or None


def _build_user_platform_event(spec):
    if spec is None:
        return None
    if not isinstance(spec, dict):
        raise ValueError(f"userPlatformEvent must be an object; got {type(spec).__name__}")
    out = {}
    if "type" not in spec:
        raise ValueError("userPlatformEvent.type is required when type=userPlatformEvent")
    out["type"] = _enum(spec["type"], USER_PLATFORM_EVENT_TYPES, "userPlatformEvent.type")
    if spec.get("twoFaUsed") is not None:
        out["twoFaUsed"] = bool(spec["twoFaUsed"])
    if spec.get("passwordHash") is not None:
        out["passwordHash"] = spec["passwordHash"]
    return out


def build_transaction(spec):
    if not isinstance(spec, dict):
        raise ValueError(f"transaction spec must be an object; got {type(spec).__name__}")

    txn_id = spec.get("txnId")
    if not txn_id or not isinstance(txn_id, str):
        raise ValueError("txnId is required and must be a non-empty string")

    txn_type = _enum(spec.get("type", "finance"), TOP_TYPES, "type")

    # Routing keys — stored in sidecar, stripped from payload
    applicant_id = spec.get("_applicantId")
    level_name   = spec.get("_levelName")
    if applicant_id and level_name:
        raise ValueError("set only ONE of _applicantId / _levelName, not both")
    if not applicant_id and not level_name and txn_type == "finance":
        # finance txns can target an existing applicant via the spec's applicant.externalUserId,
        # but the URL still needs an applicantId or a levelName. We let the post script enforce.
        pass

    payload = {
        "txnId": txn_id,
        "type": txn_type,
    }
    if spec.get("txnDate") is not None:
        payload["txnDate"] = spec["txnDate"]
    if spec.get("zoneId") is not None:
        payload["zoneId"] = spec["zoneId"]
    if spec.get("orderId") is not None:
        payload["orderId"] = spec["orderId"]
    if spec.get("sourceKey") is not None:
        payload["sourceKey"] = spec["sourceKey"]
    if spec.get("props") is not None:
        if not isinstance(spec["props"], dict):
            raise ValueError("props must be an object (string->string)")
        payload["props"] = {k: str(v) for k, v in spec["props"].items()}

    # info — flatten top-level amount/currency/... + crypto.* into KytTxnInfo
    info = _build_info(spec)
    if info:
        payload["info"] = info

    # Per-type required-field checks
    if txn_type in ("finance", "travelRule"):
        for k in ("amount", "currencyCode", "direction"):
            if info is None or info.get(k) is None:
                raise ValueError(f"type={txn_type} requires info.{k} (set top-level "
                                 f"{'amount' if k=='amount' else ('currency' if k=='currencyCode' else 'direction')})")

    # applicant — REQUIRED on every txn
    if "applicant" not in spec:
        raise ValueError("applicant is required")
    payload["applicant"] = _build_participant(
        spec["applicant"], label="applicant", require_external_id=True,
    )

    if spec.get("counterparty") is not None:
        payload["counterparty"] = _build_participant(
            spec["counterparty"], label="counterparty", require_external_id=False,
        )

    if txn_type == "userPlatformEvent":
        upe = spec["userPlatformEvent"] if "userPlatformEvent" in spec else spec.get("userPlatformEventInfo")
        if upe is None:
            raise ValueError(
                "type=userPlatformEvent requires a `userPlatformEvent` block "
                "(with at least `type:` set)"
            )
        payload["userPlatformEventInfo"] = _build_user_platform_event(upe)

    # Sidecar route file: lets post_transaction.sh pick the URL without re-parsing
    route_path = os.environ.get("SUMSUB_TXN_ROUTE_FILE")
    if route_path:
        with open(route_path, "w") as f:
            json.dump({
                "applicantId": applicant_id,
                "levelName": level_name,
                "txnId": txn_id,
            }, f)

    return payload


def main():
    spec = json.load(sys.stdin)
    payload = build_transaction(spec)
    json.dump(payload, sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
