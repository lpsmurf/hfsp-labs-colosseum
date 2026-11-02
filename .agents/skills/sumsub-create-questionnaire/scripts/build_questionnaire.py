#!/usr/bin/env python3
"""
Expand a compact questionnaire spec (JSON on stdin) into the full
Sumsub `QuestionnaireDefinition` payload (JSON on stdout).

Compact spec shape:
{
  "id": "<slug>",                         # required, unique within client
  "title": "<human title>",               # required
  "desc": "<optional>",
  "showTitleAsStepName": true,            # optional, default true
  "sections": [
    {
      "id": "<slug>",                     # required
      "title": "<human>",                 # required
      "desc": "<optional>",
      "condition": "<expr>",              # optional, e.g. "primary.main = salary"
      "items": [
        {
          "id": "<slug>",                 # required
          "title": "<human>",             # required
          "type": "<itemType>",           # required, see SUPPORTED_TYPES
          "required": false,              # optional
          "desc": "<optional>",
          "placeholder": "<optional>",
          "format": "<optional regex/format>",
          "condition": "<expr>",          # optional show condition
          "options": [["value","title"], ...]   # required for select-types
                                                # optional 3rd element = score (number)
        }
      ]
    }
  ]
}


Input may be JSON or YAML. YAML requires PyYAML (`pip install pyyaml`);
if PyYAML is not installed, only JSON is accepted.
"""
import json
import sys

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


SUPPORTED_TYPES = {
    "text", "textArea", "date", "dateTime", "bool", "select", "phone",
    "selectDropdown", "multiSelect", "countrySelect", "countryMultiSelect",
    "fileAttachment", "multiFileAttachments",
}
SELECT_TYPES = {"select", "selectDropdown", "multiSelect"}


def loc(value):
    if value is None:
        return None
    return {"values": [{"lang": "en", "value": value}]}


def build_item(it):
    iid = it["id"]
    title = it["title"]
    typ = it["type"]
    if typ not in SUPPORTED_TYPES:
        raise ValueError(f"item {iid!r}: unsupported type {typ!r}; allowed={sorted(SUPPORTED_TYPES)}")
    out = {
        "id": iid,
        "title": title,
        "localizedTitle": loc(title),
        "type": typ,
        "required": bool(it.get("required", False)),
    }
    if "desc" in it and it["desc"]:
        out["desc"] = it["desc"]
        out["localizedDesc"] = loc(it["desc"])
    if "placeholder" in it and it["placeholder"]:
        out["placeholder"] = it["placeholder"]
        out["localizedPlaceholder"] = loc(it["placeholder"])
    if "format" in it and it["format"]:
        out["format"] = it["format"]
    if "condition" in it and it["condition"]:
        out["condition"] = it["condition"]
    if typ in SELECT_TYPES:
        opts = it.get("options")
        if not opts:
            raise ValueError(f"item {iid!r}: type {typ} requires non-empty options")
        built = []
        for opt in opts:
            if len(opt) == 2:
                v, t = opt
                score = None
            elif len(opt) == 3:
                v, t, score = opt
            else:
                raise ValueError(f"item {iid!r}: option must be [value, title] or [value, title, score], got {opt!r}")
            entry = {"value": v, "title": t, "localizedTitle": loc(t)}
            if score is not None:
                entry["score"] = score
            built.append(entry)
        out["options"] = built
    return out


def build_section(sec):
    sid = sec["id"]
    title = sec["title"]
    items = sec.get("items") or []
    if not items:
        raise ValueError(f"section {sid!r}: must have at least one item")
    out = {
        "id": sid,
        "title": title,
        "localizedTitle": loc(title),
        "items": [build_item(it) for it in items],
    }
    if sec.get("desc"):
        out["desc"] = sec["desc"]
        out["localizedDesc"] = loc(sec["desc"])
    if sec.get("condition"):
        out["condition"] = sec["condition"]
    return out


def build_questionnaire(spec):
    for k in ("id", "title", "sections"):
        if k not in spec:
            raise ValueError(f"spec missing required field: {k}")
    sections = [build_section(s) for s in spec["sections"]]

    section_ids = [s["id"] for s in sections]
    if len(set(section_ids)) != len(section_ids):
        raise ValueError(f"duplicate section ids: {section_ids}")
    for s in sections:
        ids = [it["id"] for it in s["items"]]
        if len(set(ids)) != len(ids):
            raise ValueError(f"duplicate item ids in section {s['id']}: {ids}")

    q = {
        "id": spec["id"],
        "title": spec["title"],
        "localizedTitle": loc(spec["title"]),
        "showTitleAsStepName": bool(spec.get("showTitleAsStepName", True)),
        "sections": sections,
    }
    if spec.get("desc"):
        q["desc"] = spec["desc"]
        q["localizedDesc"] = loc(spec["desc"])
    return q


def main():
    spec = _load_spec(sys.stdin)
    payload = build_questionnaire(spec)
    json.dump(payload, sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
