# QuestionnaireDefinition — schema reference

Source: Sumsub OpenAPI (`components.schemas.QuestionnaireDefinition`).

## Top-level fields

| Field | Type | Notes |
|---|---|---|
| `id` | string | Slug — must be unique within the client. Used by levels via `questionnaireDefId`. |
| `title` | string | Human title shown to applicants. |
| `desc` | string | Optional applicant-facing description. |
| `localizedTitle` | LocalizedValue | `{values: [{lang, value}]}` — auto-built from `title`. |
| `localizedDesc` | LocalizedValue | Same shape; auto-built from `desc`. |
| `showTitleAsStepName` | boolean | If true, the questionnaire's title is used as the WebSDK step label. |
| `sections` | QuestionnaireSection[] | Required. Order matters. |
| `clientId`, `createdAt`, `_id` | — | Server-populated; do NOT send. |

## QuestionnaireSection

| Field | Type | Notes |
|---|---|---|
| `id` | string | Slug, unique within questionnaire. |
| `title` / `localizedTitle` | string / LocalizedValue | |
| `desc` / `localizedDesc` | string / LocalizedValue | Optional. |
| `condition` | string | Show/hide expression — see *Conditions*. |
| `items` | QuestionnaireItem[] | At least one. |

## QuestionnaireItem

| Field | Type | Notes |
|---|---|---|
| `id` | string | Slug, unique within section. |
| `title` / `localizedTitle` | string / LocalizedValue | |
| `desc` / `localizedDesc` | string / LocalizedValue | Optional helper text. |
| `placeholder` / `localizedPlaceholder` | string / LocalizedValue | Optional. |
| `type` | enum | See *Item types* below. |
| `required` | boolean | |
| `format` | string | Optional regex/format constraint for `text` types. |
| `condition` | string | Show/hide expression. |
| `options` | QuestionnaireItemOption[] | Required for `select` / `selectDropdown` / `multiSelect`. Each option: `{value, title, localizedTitle, score?}`. |
| `arbitraryDocType` | string | Used with file-attachment types when no preset doc type fits. |

## Item types (enum)

```
text, textArea, date, dateTime, bool, select, phone,
selectDropdown, multiSelect, countrySelect, countryMultiSelect,
fileAttachment, multiFileAttachments
```

- `select` → radio-style, single answer. Use for ≤7 options.
- `selectDropdown` → same semantics, dropdown UI. Use for long option lists.
- `multiSelect` → checkboxes; answer is an array.
- `countrySelect` / `countryMultiSelect` → ISO-3166-1 alpha-3 country codes; do NOT supply `options`.
- `bool` → renders as Yes/No; value is `"true"` / `"false"` strings server-side.
- `fileAttachment` / `multiFileAttachments` → uploads; not part of the spec value but referenced from applicant docs.

## Conditions

`condition` is a plain expression string evaluated against previously-answered items. Format:

```
<sectionId>.<itemId> <op> <literal> [AND|OR <sectionId>.<itemId> <op> <literal>]*
```

- Operators: `=`, `!=`. Combine with `AND` / `OR` (uppercase).
- Literals are bare tokens for option values (`= salary`), bare `true`/`false` for `bool`, ISO codes for country selects (`= GRC`). Tokens with spaces should be avoided — use slug values in `options`.
- Examples (verified against an existing dashboard questionnaire):
  - `primary.main = salary`
  - `primary.main = salary OR primary.main = business`
  - `nationality_1.citizenship != GRC AND nationality_1.hasPriority1 = true`

`condition` works at item *and* section level; section-level conditions hide the entire block.

## LocalizedValue shape

```json
{ "values": [ { "lang": "en", "value": "..." } ] }
```

Add additional `{lang, value}` entries for multi-language deployments. The compact spec only carries English; extend the builder if you need more languages.

## Common gotchas

- **`id` is required on POST** — the server does not auto-generate it. Omitting `id` returns `HTTP 400 — Invalid questionnaire id: null`. Use a stable slug (e.g. `country-product-kyc`).
- `id` collisions across questionnaires fail with HTTP 400 — pick a fresh slug.
- Sending server-only fields (`_id`, `clientId`, `createdAt`) is tolerated but pointless; the builder strips them.
- Required `select`s with no `options` cause silent dashboard rendering bugs — the builder rejects them upfront.
- Conditions reference item ids by **section id + item id**, not item id alone. Common mistake.
- HTTP 400 with `description: "..."` is the contract for validation errors. Read it; don't retry blindly.

## Raw `showCondition` shape (wire format)

The compact spec uses plain strings (`"primary.main = other"`); the builder translates them. If constructing payloads directly, the server accepts:

```json
"showCondition": { "field": "<sectionId>.<itemId>", "op": "eq", "value": "<optionValue>" }
```
