---
name: sumsub-create-workflow
description: Create a Sumsub applicant workflow via the public ApplicantWorkflow API (App Token auth). TRIGGER when the user asks to "create / build / add a Sumsub workflow", supplies a flowchart-style description of verification routing (levels + branches + actions), wants to wire country-based routing / age routing / re-attempt logic, asks to set up final-rejection or manual-review steps in a flow, or wants to model an action workflow (post-verification automations like tagging, notes, source-key changes). Also covers publishing the resulting revision (`/revisionStatus`). SKIP for editing arbitrary fields of an existing workflow revision, or for the broader product-config flows (questionnaires, levels — separate skills cover those).
allowed-tools: Read, Write, Bash
---

# Sumsub — Create Workflow

Builds an `ApplicantWorkflow` JSON payload from a compact node/edge spec, POSTs it to the Sumsub public API, and (optionally) flips the resulting revision from `draft` to `published`. Reports the resulting `id` / `revision` / `revisionStatus`.

## Endpoints

| Method | Path | When |
|---|---|---|
| `POST` | `/resources/api/applicantWorkflows` | Create new (no `id` in body) or upsert by `id`. Defaults to `revisionStatus: draft` — nothing is activated until you publish. |
| `GET`  | `/resources/api/applicantWorkflows` | List workflows. |
| `GET`  | `/resources/api/applicantWorkflows/{id}` | Read one workflow. |
| `PUT`  | `/resources/api/applicantWorkflows/{id}/revisionStatus` | Promote `draft` → `published`, or archive an active revision. Body: `{"revisionStatus":"published"\|"archived"\|"draft"}`. |
| `POST` | `/resources/api/applicantWorkflows/-/validate` | Dry-run validation. Returns the same `notices[]` you'd get from POST without persisting. |

Permission required on the App Token: `manageWorkflows`. Sandbox tokens typically have it; if you hit `403 Unauthorized (atd)`, regenerate the token with the right scopes.

> **Two-step lifecycle.** POST creates a `draft`. Publishing is a separate
> PUT to `/revisionStatus`. Always GET the persisted draft and surface any
> `notices[]` (especially `severity: error` — those prevent publish) before
> calling publish.

## Auth — App Token + secret (sandbox only)

This skill talks to the public Sumsub API and signs each request per
[the authentication reference](https://docs.sumsub.com/reference/authentication).
The full how-it-works writeup lives in the [`sumsub-api-auth`](../sumsub-api-auth/SKILL.md)
skill — read it if you hit `401 Invalid signature`.

> **⚠️ Sandbox tokens only.** Do **not** accept or use a production App Token
> here — a workflow controls how real applicants get routed. If the user
> offers a prod token, refuse and ask them to generate a sandbox pair at
> <https://cockpit.sumsub.com/checkus/devSpace/appTokens> (toggle the
> workspace to **Sandbox** first, then **Create**). Token + secret are
> shown once — copy both before closing the dialog. The helper script
> enforces this — it rejects tokens that don't start with `sbx:`.

| Var | Example |
|---|---|
| `SUMSUB_APP_TOKEN` | `sbx:...` — sandbox App Token from the dashboard. |
| `SUMSUB_SECRET_KEY` | The paired secret shown once at token creation. |
| `SUMSUB_BASE` | Optional. Defaults to `https://api.sumsub.com`. |

If the user has already supplied credentials in conversation, reuse them;
otherwise ask once before running. Never echo the secret back.

## Procedure

1. **Translate the user's flowchart into the compact spec** (below). One node per box / decision diamond, one edge per arrow. Use `id`s that read like labels (`country-check`, `route`, `idv`, `reject-region`).
2. **Validate the graph:** every edge `from`/`to` resolves to a node id; every `level` / `actionLevel` node references a real level by name; every `condition` / `exclusiveChoice` node must have every outgoing edge include a `when` clause (no unconditional branches allowed); final-rejection nodes carry either `labels` or `buttonIds`.
3. **Generate payload** with `${CLAUDE_SKILL_DIR}/scripts/build_workflow.py` — compact spec on stdin → full payload on stdout. The builder parses `when:` expression strings into Sumsub's nested AST and produces the branch structure expected by the API (e.g. an expression is converted into the canonical `{or:[{and:[{...}]}]}` form and any negated clause is wrapped using the explicit `negate` node as required by the schema). Any user-supplied literal Sumsub AST may instead be provided via `whenRaw:`; the builder leaves `whenRaw:` untouched and inserts it directly in the resulting payload.
4. **POST** via `${CLAUDE_SKILL_DIR}/scripts/post_workflow.sh` → response carries the persisted draft with server-assigned `id` and any `notices[]` (validation hints).
5. **Inspect `notices`.** A `severity: info` notice is advisory (e.g. "31 countries inline — consider a vocabulary"). A `severity: error` notice is a publish-blocker (e.g. `tagDoesNotExist`). Resolve every error before step 7 — re-POST the spec with `id` set to the draft's id to upsert in place.
6. **Build the dashboard link.** Read `clientId` from the response body and format:

   ```
   https://cockpit.sumsub.com/checkus/sdkIntegrations/workflows/active/applicant?clientId=<clientId>&xSNSEnv=sbx
   ```

   The `xSNSEnv=sbx` query param targets the **Sandbox** workspace — it is the canonical sandbox link param shared across all skills.

   ⚠️ **Not a deep link.** This page shows whichever workflow is currently in draft — it is **not** per-`_id` addressable. If the user POSTs another draft before clicking, the link will land on the *new* draft, not this one. Tell the user that and recommend clicking the link promptly after creation.
7. **Publish (when ready).** Run `${CLAUDE_SKILL_DIR}/scripts/publish_workflow.sh <workflow-id>` — defaults to `published`. Pass `archived` to retire a previously-published revision, or `draft` to revert. Until you publish, the workflow is dormant — applicants won't be routed through it.
8. **Report**: human-readable workflow `title`, `revision`, `revisionStatus`, node/edge counts, sorted unique level names referenced, and the **dashboard link as a clickable markdown link** with the "current draft" caveat. End with a dedicated `Workflow ID (for publish / future PATCH): <id>` line — that is the one place a raw id belongs in your output.

## Compact spec format (JSON or YAML on stdin)

> **`title` is the user-facing name.** The API's `name` field is an enum
> (`default` for verification workflows, `actions` for action-only
> post-verification workflows, `test` for sandbox experiments). The builder
> sets it from `kind:` (default: `default`) — don't put your workflow's
> human-readable label there.

```yaml
title: "Country-Routed KYC"     # required — human-readable name shown in the dashboard
kind: default                   # optional — default | test | actions (API name field)
revisionStatus: draft           # optional; default: draft. Use publish_workflow.sh to go live.

nodes:
  - id: country-check
    type: level                  # -> applicantLevel
    levelName: "Country Selector"
  - id: route
    type: condition              # -> exclusiveChoice
    name: "Country router"
  - id: idv
    type: level
    levelName: "IDV"
  - id: reject-region
    type: rejectFinal            # -> finalRejection
    labels: ["WRONG_USER_REGION"]
  - id: manual
    type: review                 # -> manualReview

edges:
  - { from: country-check, to: route,         on: approved }
  - { from: route,         to: idv,           when: "applicant.country = USA" }
  - { from: route,         to: reject-region, when: "applicant.country in [UZB, DEU]" }
  - { from: idv,           to: manual,        on: rejected }
```

### Node `type` shortcuts (compact → real)

| Spec | Real node type | Required body field |
|---|---|---|
| `level` | `applicantLevel` | `levelName` (string) |
| `condition` | `exclusiveChoice` | — |
| `actions` | `actions` | `actions:` list (see below) |
| `review` | `manualReview` | — |
| `rejectFinal` | `finalRejection` | `labels` OR `buttonIds` |
| `actionLevel` | `actionApplicantLevel` | `levelName` |
| `actionCondition` | `actionExclusiveChoice` | — |
| `actionActions` | `actionActions` | `actions:` list |
| `actionRejectFinal` | `actionFinalRejection` | `labels` OR `buttonIds` |

Use the `action…` variants only inside an **action workflow** (a workflow that runs after a primary verification completes — typically a small graph that just tags / notes / changes source key).

### Actions block

Inside an `actions` or `actionActions` node:

```yaml
- id: tag-and-note
  type: actions
  actions:
    - tag: ["High risk", "Manual review"]   # adds tags
    - note: "Flagged by workflow"           # adds applicant note
    - sourceKey: "manual-flow"              # overrides applicant source key
    - riskLevel: true                       # triggers risk-level recompute (no params)
```

Each item must contain exactly one of: `tag`, `note`, `sourceKey`, `riskLevel`.

### Edge `when:` expression syntax

The builder parses simple comparison strings into Sumsub's edge-condition AST. Supported:

| Compact | Operator |
|---|---|
| `<expr> = <literal>` | `eq` |
| `<expr> != <literal>` | `ne` |
| `<expr> > <number>` | `gt` |
| `<expr> < <number>` | `lt` |
| `<expr> <= <number>` | `lte` |
| `<expr> >= <number>` | `gte` |
| `<expr> in [a, b, c]` | `in` |
| `<expr> not in [a, b]` | `notIn` |
| `<expr> contains <value>` | `contains` |
| `<expr> not contains <value>` (alias `notContains`) | (negated `contains`) |
| `<expr> starts with <value>` | `startsWith` |
| `<expr> not starts with <value>` | `notStartsWith` |
| `not empty <expr>` (alias `<expr> not empty`) | `notEmpty` |
| `empty <expr>` (alias `<expr> empty`) | `empty` |

Combine with `AND` / `OR` (case-insensitive). `AND` groups bind to the same OR branch.

Literals follow JSON conventions: bare words become strings (`USA` → `"USA"`); double-quoted strings stay strings; `true`/`false` → booleans; numbers → numbers; `[a, b]` → array of strings (quote individual items for non-bare values).

For anything the parser can't handle (function calls like `call: checkFullName`, deeply nested OR-of-AND), use **`whenRaw:`** with the literal Sumsub AST and the builder will pass it through.

### Edge `on:` shortcut (review-decision routing)

`on: approved` ↦ `reviewDecisions: ["approved"]`. Allowed values: `approved`, `rejected`, `resubmission`. Pass an array to match multiple. `on:` and `when:` can coexist on the same edge.

## Outputs

On success, report all of:
- `_id`, `name`, `revision`, `revisionStatus`.
- Node/edge counts, sorted list of unique level names referenced (so the user can verify nothing's misspelled).
- **Dashboard link**: `https://cockpit.sumsub.com/checkus/sdkIntegrations/workflows/active/applicant?clientId=<clientId>&xSNSEnv=sbx`. Render as a clickable markdown link with the caveat that this page shows the **current draft**, not the just-created workflow specifically — click promptly. `clientId` comes from the POST response body; `xSNSEnv=sbx` targets the Sandbox workspace.

On failure: surface Sumsub's `description` / `errorName` verbatim. Validation errors before POST are raised by the builder with a precise message.

## Worked examples

- [`examples/country-routing.json`](examples/country-routing.json) — entry level → condition → IDV / region-reject / manual-review (the most common topology).
- [`examples/action-workflow.json`](examples/action-workflow.json) — small action-workflow that tags and notes after a level completes.
- [`examples/risk-routing.json`](examples/risk-routing.json) — re-attempt routing using `applicant.review.attemptCnt > 3` and `applicant.country` checks.

## See also

- [references/workflow-schema.md](references/workflow-schema.md) — full `ApplicantWorkflow` field list, every node type's body, every edge-condition operator with real-world expression paths from production workflows, and the draft/published/archived lifecycle.
