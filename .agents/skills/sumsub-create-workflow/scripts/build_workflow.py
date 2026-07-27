#!/usr/bin/env python3
"""
Expand a compact workflow spec (JSON on stdin) into a full Sumsub
`ApplicantWorkflow` payload (JSON on stdout).

Spec format: see SKILL.md.

Highlights:
- Node-type shortcuts (level / condition / actions / review / rejectFinal)
- Action sub-item shortcuts (tag / note / sourceKey / riskLevel)
- A `when:` expression mini-parser that emits Sumsub's nested
  {or:[{negate:false, and:[{op, args:[{exp},{lit}]}]}]} AST.
- `whenRaw:` escape hatch passes through an arbitrary AST untouched.
- Graph validation: dangling edges, unknown level refs (warned), duplicate
  ids, missing required fields per node type.
"""
import json
import re
import sys
from collections import Counter
from typing import Any

# ---------- enums & node-type mapping -----------------------------------------

NODE_TYPE_ALIASES = {
    "level":              "applicantLevel",
    "condition":          "exclusiveChoice",
    "actions":            "actions",
    "review":             "manualReview",
    "rejectFinal":        "finalRejection",
    "actionLevel":        "actionApplicantLevel",
    "actionCondition":    "actionExclusiveChoice",
    "actionActions":      "actionActions",
    "actionRejectFinal":  "actionFinalRejection",
}
KNOWN_NODE_TYPES = set(NODE_TYPE_ALIASES.values())
LEVEL_NODE_TYPES = {"applicantLevel", "actionApplicantLevel"}
ACTIONS_NODE_TYPES = {"actions", "actionActions"}
REJECT_NODE_TYPES = {"finalRejection", "actionFinalRejection"}
# Sumsub rejects mixing standard and action node types in one workflow.
# action-* types only belong in an action workflow (kind="actions"); the rest
# only belong in a verification workflow (kind="default" or "test").
ACTION_PREFIXED_NODE_TYPES = {
    "actionApplicantLevel",
    "actionExclusiveChoice",
    "actionActions",
    "actionFinalRejection",
}

REVIEW_DECISIONS = {"approved", "rejected", "resubmission"}

ACTION_ITEM_TYPES = {
    "tag":       ("tags",      lambda v: {"type": "tags",      "tags":      {"tags": _list(v)}}),
    "note":      ("notes",     lambda v: {"type": "notes",     "notes":     {"note": str(v)}}),
    "sourceKey": ("sourceKey", lambda v: {"type": "sourceKey", "sourceKey": {"sourceKey": str(v)}}),
    "riskLevel": ("riskLevel", lambda v: {"type": "riskLevel"}),
}


def _list(v):
    return v if isinstance(v, list) else [v]


# ---------- expression mini-parser --------------------------------------------

# Tokens: identifiers/expression paths, operators, literals, parens, AND/OR, etc.
_TOKEN_RE = re.compile(
    r"""
    \s*(?:
        (?P<str>"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*') |
        (?P<num>-?\d+(?:\.\d+)?) |
        (?P<lbr>\[) | (?P<rbr>\]) |
        (?P<lparen>\() | (?P<rparen>\)) |
        (?P<comma>,) |
        (?P<op>!=|<=|>=|=|<|>) |
        (?P<word>[A-Za-z_][A-Za-z0-9_.\-]*)
    )
    """,
    re.VERBOSE,
)


class ExprError(ValueError):
    pass


def _tokenize(s: str):
    pos = 0
    tokens = []
    while pos < len(s):
        m = _TOKEN_RE.match(s, pos)
        if not m:
            raise ExprError(f"unexpected character at offset {pos}: {s[pos:pos+20]!r}")
        if m.end() == pos:
            raise ExprError(f"zero-width match at offset {pos}")
        # Identify which group matched
        for name in ("str", "num", "lbr", "rbr", "lparen", "rparen", "comma", "op", "word"):
            val = m.group(name)
            if val is not None:
                tokens.append((name, val))
                break
        pos = m.end()
    return tokens


def _encode_lit(value: str, raw_kind: str) -> str:
    """Sumsub stores lit values as JSON-encoded strings ('\"USA\"', '3', 'true', '[\"a\",\"b\"]')."""
    if raw_kind == "str":
        # strip quotes from source token
        inner = value[1:-1]
        # unescape backslashes the lexer allowed
        inner = bytes(inner, "utf-8").decode("unicode_escape")
        return json.dumps(inner)
    if raw_kind == "num":
        # keep as numeric literal
        return value
    if raw_kind == "bool":
        return value  # "true"/"false"
    if raw_kind == "null":
        return "null"
    raise ExprError(f"unsupported literal kind {raw_kind!r}")


def _atom_to_lit(tok):
    """Convert a single token to a Sumsub `{lit: "..."}` value."""
    kind, val = tok
    if kind == "str":
        return {"lit": _encode_lit(val, "str")}
    if kind == "num":
        return {"lit": val}
    if kind == "word":
        # bare word: treat as string literal (matches dashboard UX where USA = "USA")
        if val.lower() in ("true", "false"):
            return {"lit": val.lower()}
        if val.lower() == "null":
            return {"lit": "null"}
        return {"lit": json.dumps(val)}
    raise ExprError(f"expected literal, got {tok!r}")


def _parse_array(toks, i):
    """Parse `[ x, y, z ]` starting after the `[`. Returns (json_array_string, new_i)."""
    items = []
    expecting_value = True
    while i < len(toks):
        kind, val = toks[i]
        if kind == "rbr":
            if expecting_value and items:
                raise ExprError("trailing comma in array literal")
            return ("[" + ", ".join(items) + "]", i + 1)
        if expecting_value:
            lit = _atom_to_lit(toks[i])["lit"]
            items.append(lit)
            expecting_value = False
            i += 1
        else:
            if kind != "comma":
                raise ExprError(f"expected ',' or ']' in array; got {val!r}")
            i += 1
            expecting_value = True
    raise ExprError("unterminated array literal")


def _consume_comparison(toks, i):
    """Parse a single comparison clause, returning (clause_dict, new_i)."""
    # Prefix forms: `not empty <expr>` and `empty <expr>`
    if i < len(toks) and toks[i][0] == "word":
        head = toks[i][1].lower()
        if head == "notempty":
            i += 1
            if i >= len(toks) or toks[i][0] != "word":
                raise ExprError("notEmpty expects an expression path after it")
            exp_path = toks[i][1]; i += 1
            return ({"op": "notEmpty", "args": [{"exp": exp_path}]}, i)
        if head == "empty":
            i += 1
            if i >= len(toks) or toks[i][0] != "word":
                raise ExprError("empty expects an expression path after it")
            exp_path = toks[i][1]; i += 1
            return ({"op": "empty", "args": [{"exp": exp_path}]}, i)
        if (
            head == "not"
            and i + 1 < len(toks)
            and toks[i + 1][0] == "word"
            and toks[i + 1][1].lower() == "empty"
        ):
            i += 2
            if i >= len(toks) or toks[i][0] != "word":
                raise ExprError("not empty expects an expression path after it")
            exp_path = toks[i][1]; i += 1
            return ({"op": "notEmpty", "args": [{"exp": exp_path}]}, i)

    # Standard: <expr> <operator> <literal-or-array>
    if i >= len(toks) or toks[i][0] != "word":
        raise ExprError(f"expected expression path at token {i}: {toks[i:i+3]!r}")
    exp_path = toks[i][1]
    i += 1

    if i >= len(toks):
        raise ExprError(f"expected operator after {exp_path!r}")

    kind, val = toks[i]
    # Word-based operators: in / not / contains / starts / empty
    if kind == "word":
        lw = val.lower()
        if lw == "in":
            i += 1
            if i >= len(toks) or toks[i][0] != "lbr":
                raise ExprError("'in' must be followed by [list]")
            arr, i = _parse_array(toks, i + 1)
            return ({"op": "in", "args": [{"exp": exp_path}, {"lit": arr}]}, i)
        if lw == "not":
            i += 1
            if i >= len(toks):
                raise ExprError("'not' must be followed by 'in', 'contains', 'empty', or 'starts'")
            sub = toks[i][1].lower() if toks[i][0] == "word" else None
            if sub == "in":
                i += 1
                if i >= len(toks) or toks[i][0] != "lbr":
                    raise ExprError("'not in' must be followed by [list]")
                arr, i = _parse_array(toks, i + 1)
                return ({"op": "notIn", "args": [{"exp": exp_path}, {"lit": arr}]}, i)
            if sub == "contains":
                i += 1
                rhs = _atom_to_lit(toks[i]); i += 1
                return ({"negate": True, "op": "contains", "args": [{"exp": exp_path}, rhs]}, i)
            if sub == "starts":
                i += 1
                if i >= len(toks) or toks[i][0] != "word" or toks[i][1].lower() != "with":
                    raise ExprError("'not starts' must be followed by 'with <value>'")
                i += 1
                rhs = _atom_to_lit(toks[i]); i += 1
                return ({"op": "notStartsWith", "args": [{"exp": exp_path}, rhs]}, i)
            if sub == "empty":
                i += 1
                return ({"op": "notEmpty", "args": [{"exp": exp_path}]}, i)
            raise ExprError(f"'not' must be followed by 'in', 'contains', 'starts', or 'empty'; got {sub!r}")
        if lw == "contains":
            i += 1
            rhs = _atom_to_lit(toks[i]); i += 1
            return ({"op": "contains", "args": [{"exp": exp_path}, rhs]}, i)
        if lw == "starts":
            i += 1
            if i >= len(toks) or toks[i][0] != "word" or toks[i][1].lower() != "with":
                raise ExprError("'starts' must be followed by 'with <value>'")
            i += 1
            rhs = _atom_to_lit(toks[i]); i += 1
            return ({"op": "startsWith", "args": [{"exp": exp_path}, rhs]}, i)
        if lw == "empty":
            return ({"op": "empty", "args": [{"exp": exp_path}]}, i + 1)

    if kind == "op":
        op_map = {"=": "eq", "==": "eq", "!=": "ne", ">": "gt", "<": "lt", ">=": "gte", "<=": "lte"}
        sumsub_op = op_map[val]
        i += 1
        if i >= len(toks):
            raise ExprError(f"expected literal after {val!r}")
        rhs = _atom_to_lit(toks[i]); i += 1
        return ({"op": sumsub_op, "args": [{"exp": exp_path}, rhs]}, i)

    raise ExprError(f"unrecognized operator {val!r} after expression {exp_path!r}")


def _parse_and_chain(toks, i):
    """Parse a chain of AND'd comparisons; returns (and_list, new_i)."""
    items = []
    clause, i = _consume_comparison(toks, i)
    items.append(clause)
    while i < len(toks) and toks[i][0] == "word" and toks[i][1].lower() == "and":
        i += 1
        clause, i = _consume_comparison(toks, i)
        items.append(clause)
    return (items, i)


def parse_when(expr: str):
    """Parse a `when:` expression string into Sumsub's edge-condition AST."""
    if not expr.strip():
        raise ExprError("empty expression")
    toks = _tokenize(expr)
    branches = []
    and_clauses, i = _parse_and_chain(toks, 0)
    branches.append({"negate": False, "and": and_clauses})
    while i < len(toks) and toks[i][0] == "word" and toks[i][1].lower() == "or":
        i += 1
        and_clauses, i = _parse_and_chain(toks, i)
        branches.append({"negate": False, "and": and_clauses})
    if i != len(toks):
        raise ExprError(f"trailing tokens after expression: {toks[i:]!r}")
    return {"or": branches}


# ---------- node / edge / action builders -------------------------------------

def _build_action_item(item: dict) -> dict:
    """Convert a compact action item ({tag:...} / {note:...} / ...) to Sumsub shape."""
    if not isinstance(item, dict) or len(item) != 1:
        raise ValueError(f"action item must be a single-key dict; got {item!r}")
    key, val = next(iter(item.items()))
    if key not in ACTION_ITEM_TYPES:
        raise ValueError(f"unknown action item kind {key!r}; allowed: {sorted(ACTION_ITEM_TYPES)}")
    _, builder = ACTION_ITEM_TYPES[key]
    return builder(val)


def _build_node(spec: dict) -> dict:
    if "id" not in spec:
        raise ValueError(f"node missing 'id': {spec!r}")
    if "type" not in spec:
        raise ValueError(f"node {spec['id']!r} missing 'type'")
    alias = spec["type"]
    real_type = NODE_TYPE_ALIASES.get(alias, alias)
    if real_type not in KNOWN_NODE_TYPES:
        raise ValueError(f"node {spec['id']!r}: unknown type {alias!r}; allowed: {sorted(NODE_TYPE_ALIASES)}")

    node = {"id": spec["id"], "type": real_type}
    if spec.get("name") is not None:
        node["name"] = spec["name"]

    if real_type in LEVEL_NODE_TYPES:
        level_name = spec.get("levelName") or (spec.get("applicantLevel") or {}).get("levelName")
        if not level_name:
            raise ValueError(f"node {spec['id']!r}: type {alias} requires 'levelName'")
        node["applicantLevel"] = {"levelName": level_name}
        if spec.get("disableGoBack") is not None:
            node["disableGoBack"] = bool(spec["disableGoBack"])

    elif real_type in ACTIONS_NODE_TYPES:
        items_in = spec.get("actions") or []
        if not items_in:
            raise ValueError(f"node {spec['id']!r}: type {alias} requires non-empty 'actions'")
        node["actions"] = {"items": [_build_action_item(it) for it in items_in]}

    elif real_type in REJECT_NODE_TYPES:
        labels = spec.get("labels")
        button_ids = spec.get("buttonIds")
        if not labels and not button_ids:
            raise ValueError(f"node {spec['id']!r}: type {alias} requires 'labels' or 'buttonIds'")
        node["finalRejection"] = {}
        if labels:
            node["finalRejection"]["reviewRejectLabels"] = list(labels)
        if button_ids:
            node["finalRejection"]["reviewButtonIds"] = list(button_ids)

    elif real_type in ("exclusiveChoice", "actionExclusiveChoice", "manualReview"):
        pass  # only id / type / name

    # Pass-through unknown keys (escape hatch)
    handled = {"id", "type", "name", "levelName", "applicantLevel",
               "actions", "labels", "buttonIds", "disableGoBack"}
    for k, v in spec.items():
        if k in handled or v is None:
            continue
        node[k] = v

    return node


def _build_edge(spec: dict, node_ids: set) -> dict:
    if "from" not in spec or "to" not in spec:
        raise ValueError(f"edge missing 'from'/'to': {spec!r}")
    if spec["from"] not in node_ids:
        raise ValueError(f"edge {spec!r}: 'from' id {spec['from']!r} not in nodes")
    if spec["to"] not in node_ids:
        raise ValueError(f"edge {spec!r}: 'to' id {spec['to']!r} not in nodes")

    edge = {"from": spec["from"], "to": spec["to"]}
    if spec.get("id"):
        edge["id"] = spec["id"]

    # reviewDecisions ('on:' shortcut)
    on = spec.get("on") or spec.get("reviewDecisions")
    if on is not None:
        on_list = _list(on)
        for v in on_list:
            if v not in REVIEW_DECISIONS:
                raise ValueError(f"edge {spec['from']}->{spec['to']}: reviewDecisions {v!r} not in {sorted(REVIEW_DECISIONS)}")
        edge["reviewDecisions"] = on_list

    # when: expression or whenRaw: AST
    if spec.get("whenRaw") is not None:
        edge["condition"] = spec["whenRaw"]
    elif spec.get("when") is not None:
        try:
            edge["condition"] = parse_when(spec["when"])
        except ExprError as e:
            raise ValueError(f"edge {spec['from']}->{spec['to']}: when expression error: {e}")

    return edge


# ---------- top-level --------------------------------------------------------

# The API's `name` field is a fixed enum naming the *kind* of workflow.
# User-facing names go into `title`. Compact spec exposes this as `kind:`.
WORKFLOW_KINDS = ("default", "test", "actions")


def build_workflow(spec: dict) -> dict:
    title = spec.get("title") or spec.get("name")
    if not title:
        raise ValueError("workflow spec must have 'title' (the human-readable name)")

    kind = spec.get("kind", "default")
    if kind not in WORKFLOW_KINDS:
        raise ValueError(
            f"workflow 'kind' must be one of {WORKFLOW_KINDS}; got {kind!r}. "
            f"Note: the API's `name` field is an enum (default/test/actions), "
            f"not a slug. Put your workflow's human-readable name in `title:`."
        )

    nodes_in = spec.get("nodes") or []
    if not nodes_in:
        raise ValueError("workflow must have at least one node")

    nodes = [_build_node(n) for n in nodes_in]

    # Duplicate-id check
    dupes = [iid for iid, c in Counter(n["id"] for n in nodes).items() if c > 1]
    if dupes:
        raise ValueError(f"duplicate node ids: {dupes}")

    # kind/node-type coherence: action-* node types only in action workflows,
    # standard types only in verification workflows. Sumsub rejects mixes.
    if kind == "actions":
        non_action = [
            n["id"] for n in nodes if n["type"] not in ACTION_PREFIXED_NODE_TYPES
        ]
        if non_action:
            raise ValueError(
                f"kind='actions' workflow contains non-action node(s) {non_action}. "
                f"Use the action-* node type aliases (actionLevel, actionCondition, "
                f"actionActions, actionRejectFinal) inside an action workflow."
            )
    else:  # default / test — standard verification workflow
        action_only = [
            n["id"] for n in nodes if n["type"] in ACTION_PREFIXED_NODE_TYPES
        ]
        if action_only:
            raise ValueError(
                f"kind={kind!r} workflow contains action-* node(s) {action_only}. "
                f"Use plain aliases (level, condition, actions, rejectFinal) for a "
                f"verification workflow, or set kind='actions' for a post-verification "
                f"action workflow."
            )

    node_ids = {n["id"] for n in nodes}
    edges_in = spec.get("edges") or []
    edges = [_build_edge(e, node_ids) for e in edges_in]

    # Every condition node should have ≥1 outgoing edge with a `condition`
    cond_types = {"exclusiveChoice", "actionExclusiveChoice"}
    for n in nodes:
        if n["type"] in cond_types:
            outs = [e for e in edges if e["from"] == n["id"]]
            if not outs:
                raise ValueError(f"condition node {n['id']!r} has no outgoing edges")
            if not any("condition" in e for e in outs):
                raise ValueError(
                    f"condition node {n['id']!r} must have at least one outgoing edge "
                    f"with a 'when:' clause"
                )

    payload = {
        "name": kind,
        "title": title,
        "revisionStatus": spec.get("revisionStatus", "draft"),
        "nodes": nodes,
        "edges": edges,
    }
    # Preserve id for upsert (POST with existing id updates in place).
    if spec.get("id") is not None:
        payload["id"] = spec["id"]
    if spec.get("notices") is not None:
        payload["notices"] = spec["notices"]
    if spec.get("layout") is not None:
        payload["layout"] = spec["layout"]
    if spec.get("desc") is not None:
        payload["desc"] = spec["desc"]
    return payload


def main():
    spec = json.load(sys.stdin)
    payload = build_workflow(spec)
    json.dump(payload, sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
