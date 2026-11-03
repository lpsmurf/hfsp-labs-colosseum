# ApplicantWorkflow — schema reference

Sources: Sumsub OpenAPI (`components.schemas.ApplicantWorkflow`) and the [Workflow Builder docs](https://docs.sumsub.com/docs/get-started-with-workflow-builder.md).

## Top-level fields

| Field | Type | Notes |
|---|---|---|
| `name` | enum | **Required**. Workflow *kind* — one of `default` (verification workflow), `actions` (post-verification action workflow), `test` (sandbox experiment). Not a slug. Sending anything else returns `400 "name must be one of [default, test, actions]"`. |
| `title` | string | **Required.** Human-readable name shown in the dashboard. This is the user-facing label; do not put a slug here. |
| `desc` | string | Optional description. |
| `revision` | int | Server-assigned per save. Don't send. |
| `revisionStatus` | enum | `draft`, `published`, `archived`. Default `draft`. Promotion to `published` is a separate call. |
| `nodes` | array | The vertices of the flow graph. See *Node types* below. |
| `edges` | array | Directed transitions between nodes. May carry `condition`, `reviewDecisions`. |
| `notices` | array | Optional dashboard warnings stored on the workflow (validation hints). Pass-through. |
| `layout` | object | Visual `{nodes: [{id, position:{x,y}}]}` for the dashboard's graph editor. Omitting it makes the dashboard auto-arrange. |
| `created` / `modified` / `published` / `archived` | object | Audit trails (server-populated). Don't send. |

## Node types (9 distinct types observed)

### Standard verification workflow

| Type | Compact alias | Body |
|---|---|---|
| `applicantLevel` | `level` | `{applicantLevel: {levelName: "..."}, disableGoBack?: bool}` — required entry point; references a level by `name` (NOT the level id). |
| `exclusiveChoice` | `condition` | No body — only `id`/`name`. Branches via outgoing edges' `condition`. "The same applicant can trigger only one condition branch." |
| `actions` | `actions` | `{actions: {items: [...]}}` — apply tags / notes / sourceKey / riskLevel without changing flow. |
| `manualReview` | `review` | No body — applicant lands in a queue. Per docs, supports queue + tag creation; in the API those settings live on the queue/manualReview surface separately. |
| `finalRejection` | `rejectFinal` | `{finalRejection: {reviewRejectLabels?: [...], reviewButtonIds?: [...]}}` — terminal "blocked" state. |

### Action workflow (post-verification automations)

| Type | Compact alias | Body |
|---|---|---|
| `actionApplicantLevel` | `actionLevel` | Same shape as `applicantLevel`. |
| `actionExclusiveChoice` | `actionCondition` | Same as `exclusiveChoice`. |
| `actionActions` | `actionActions` | Same as `actions`. |
| `actionFinalRejection` | `actionRejectFinal` | Same as `finalRejection`. |

Use action variants for workflows that run **after** an applicant completes a primary verification (the "Action Workflow" tab in the dashboard). Mixing standard and action node types in the same graph is rejected by Sumsub.

## Action sub-items (`actions.items[]`)

Observed sub-types and their shapes:

| Sub-type | Body | Compact alias |
|---|---|---|
| `tags` | `{tags: {tags: ["High risk", ...]}}` | `{tag: ["..."]}` |
| `notes` | `{notes: {note: "..."}}` | `{note: "..."}` |
| `sourceKey` | `{sourceKey: {sourceKey: "..."}}` | `{sourceKey: "..."}` |
| `riskLevel` | `{type: "riskLevel"}` (no body) | `{riskLevel: true}` |

Tagging is by far the most common (~133 occurrences across observed revisions); `riskLevel` is rare (1).

## Edges

```json
{
  "id": "human-or-generated",
  "from": "<node id>",
  "to":   "<node id>",
  "reviewDecisions": ["approved", "rejected", "resubmission"],
  "condition": {"or": [{"negate": false, "and": [{"op":"eq", "args":[{"exp":"applicant.country"},{"lit":"\"USA\""}]}]}]}
}
```

- `reviewDecisions` only makes sense on edges leaving `applicantLevel`/`actionApplicantLevel`. Three values observed in production: `approved` (most common), `rejected`, `resubmission`.
- `condition` is required on edges leaving `exclusiveChoice` / `actionExclusiveChoice` (the routing fan-out). The full AST is `{or: [{negate: bool, and: [<clause>...]}, ...]}`.
- Each `clause` is `{op, args: [...]}`. `op: notEmpty` and `op: empty` take one arg (the expression). Most ops take `[{exp}, {lit}]`.

### Operators observed (with frequency)

| Op | Count | Compact form | Notes |
|---|---|---|---|
| `eq` | 363 | `<expr> = <value>` | Equality. |
| `in` | 83 | `<expr> in [a, b, c]` | Membership in array. |
| `gt` | 77 | `<expr> > <number>` | |
| `notEmpty` | 51 | `not empty <expr>` | Single-arg. |
| `lte` | 19 | `<expr> <= <number>` | |
| `contains` | 10 | `<expr> contains <value>` | For array-valued expressions. |
| `notIn` | 2 | `<expr> not in [a, b]` | |
| `containsAny` | 1 | (use `whenRaw:`) | Multi-value contains. |
| `ne` | 1 | `<expr> != <value>` | |
| `notStartsWith` | 1 | `<expr> not starts with <value>` | |
| `call` | 1 | (use `whenRaw:`) | Built-in function call (e.g. `checkFullName`). |

### Literal encoding

The `lit` field carries a **JSON-encoded** value as a string:

```javascript
"USA"           → "\"USA\""
3               → "3"
true            → "true"
["USA", "DEU"]  → "[\"USA\", \"DEU\"]"
```

The builder handles encoding automatically; you write bare values in `when:` expressions.

## Expression paths (left-hand side of comparisons)

The authoritative inventory of every legal path is **[`workflow-expressions.md`](workflow-expressions.md)** — open it whenever you need to verify a path before POSTing, or to look up which fields live under a namespace. Grep by leaf field name (the index renders each segment as a markdown link, so dotted paths aren't grep-contiguous — see that file's preamble).

The table below is a cheat sheet of patterns seen most often in production. **Illustrative, not exhaustive** — trust `workflow-expressions.md` over this table when they disagree.

| Path | Use case |
|---|---|
| `applicant.country` | Reject / route by ISO-3 country (82 occurrences). |
| `poi.country` | Country pulled from the proof-of-identity document. |
| `applicant.review.attemptCnt` | "Is this the Nth re-attempt?" — common for resubmission gates. |
| `applicant.fixedInfo.firstName` | Direct profile field. |
| `questionnaires.<questionnaireId>.<sectionId>.<itemId>` | Questionnaire answer. The path mirrors the questionnaire's section/item id structure. |
| `checks.<checkName>.<field>` | Outputs of automated checks (e.g. `checks.companyWatchlist.matchStatuses`). |
| `random` | Random-bucket sampling for A/B routing. |

Paths not present in `workflow-expressions.md` are evaluated at runtime and silently resolve to "empty" — if you must use an unverified path, wrap with `notEmpty` so the edge fails closed.

## Lifecycle

1. **Create as draft** — `POST /resources/api/applicantWorkflows` with `revisionStatus: draft` (default if omitted). App Token + HMAC signing; permission `manageWorkflows`.
2. **Edit** — POST again with the same `id` in the body to upsert in place; omit `id` to create a fresh workflow.
3. **Validate without saving** — `POST /resources/api/applicantWorkflows/-/validate` with the full body; the response surfaces structural issues (orphan nodes, missing levelName, etc.).
4. **Publish** — `PUT /resources/api/applicantWorkflows/{id}/revisionStatus` with body `{"revisionStatus":"published"}`. Previous published revision auto-archives. From the docs: "Version History — All previous published versions archived and revertible." Also accepts `"archived"` and `"draft"`.
5. **Per-applicant runs** are stored separately as `ApplicantWorkflowRun` and are visible per-applicant in the Sumsub dashboard.

## Constraints from the product docs

- **Entry node required**: at least one `applicantLevel` with no incoming edges (workflows in the production data have 1–7 entry nodes — multiple entry points are allowed, contrary to a naive reading of the docs).
- **Each verification level may appear only once** within a single workflow.
- **All levels in a workflow must use the same WebSDK version** — not enforced server-side, but the dashboard warns and the resulting flow may break for SDK-mismatched applicants.
- **Sequential level transitions reset verification state** — if you want to gate progression, route through a `condition` node before the next `applicantLevel`.
- **Condition fan-out is exclusive** — only one outgoing branch fires. If multiple `condition` outputs would match the same applicant, the dashboard evaluates them in edge order and stops at the first hit.

## Common gotchas

- **`levelName` is the level's *name*, not its `id`.** Sumsub silently treats unknown level names as inactive nodes; the applicant just stalls.
- **`condition` node with no outgoing `when:`** — the workflow saves but applicants entering it have nowhere to go. The builder rejects this upfront.
- **Final-rejection labels** must be valid `reviewRejectLabel` enum values (e.g. `WRONG_USER_REGION`); button IDs come from the dashboard's "moderation buttons" config and are usually pattern-named like `fraudulentPatterns_livenessBypassAttempt`.
- **`reviewDecisions` on an edge from a non-level node** — Sumsub ignores it but the dashboard greys it out. Only attach `on:` to edges *out of* level nodes.
- **`revisionStatus: published` on first POST** — works, but skips draft review. Prefer `draft` for the initial save.
