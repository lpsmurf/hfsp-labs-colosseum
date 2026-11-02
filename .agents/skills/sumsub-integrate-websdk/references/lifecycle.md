# WebSDK + webhook lifecycle reference

Full event catalogue for both sides of the loop. The SKILL.md has the
abridged "use it for" view; this is the field-by-field truth.

## Browser events (snsWebSdk `.on` / `.onMessage`)

All event names are prefixed with `idCheck.`. Listen with
`.on('idCheck.<name>', cb)`. The `.onMessage((type, payload) => …)`
catch-all receives every event including ones not listed here — useful for
analytics.

| Event | Fires when | Payload fields |
|---|---|---|
| `onReady` | Resources loaded into the iframe | *(none)* |
| `onInitialized` | First screen rendered | *(none)* |
| `onStepInitiated` | Doc-type screen displayed | `idDocSetType`, `types` |
| `onLivenessCompleted` *(2.0)* | A liveness attempt finished | `answer`, `allowContinuing` |
| `onStepCompleted` | A step (e.g. IDENTITY) completed | `step` or `idDocSetType` |
| `onApplicantLoaded` | Applicant resolved by `externalUserId` | `applicantId` |
| `onApplicantSubmitted` | All required docs submitted | *(none)* |
| `onApplicantStatusChanged` | Status moved (intermediate or final) | `reprocessing`, `levelName`, `createDate`, `expireDate`, `reviewStatus`, `reviewResult`, `autoChecked` |
| `onApplicantResubmitted` | User submitted again after rejection | *(none)* |
| `onApplicantActionLoaded` | Applicant-action loaded | `applicantActionId` |
| `onApplicantActionSubmitted` | Applicant-action submitted | *(none)* |
| `onApplicantActionStatusChanged` | Action status moved | `reprocessing`, `levelName`, `creationDate`, `expireDate`, `reviewStatus`, `autoChecked` |
| `onApplicantActionCompleted` | Action completed | `action`, `applicantActionId`, `answer` |
| `moduleResultPresented` | Module-check result shown | `answer` (`GREEN`/`YELLOW`/`RED`) |
| `onResize` | Iframe resized | `height` |
| `onVideoIdentCallStarted` | Video-ident call started by user | *(none)* |
| `onVideoIdentModeratorJoined` | Operator joined the call | *(none)* |
| `onVideoIdentCompleted` | Video call completed | *(none)* |
| `onUploadError` | Upload rejected | `code`, `msg` |
| `onUploadWarning` | Upload accepted with a warning | `code`, `msg` |
| `onNavigationUiControlsStateChanged` *(requires `controlledNavigationBack: true`)* | Nav controls state changed | `previousScreenButton`, `closeModalButton` |
| `onApplicantLevelChanged` | Level swapped mid-flow | `levelName` |
| `onApplicantVerificationCompleted` *(2.0)* | Final verdict reached client-side | `reprocessing`, `levelName`, `createDate`, `reviewStatus`, `reviewResult`, `autoChecked` |

### `reviewStatus` values (in browser events and webhooks alike)

`init` → `pending` → `queued` → `prechecked` → `onHold` → `completed`.
Not strictly linear — `onHold` and back-to-`pending` are common.

### `reviewResult.reviewAnswer`

`GREEN` (approved) or `RED` (rejected). `YELLOW` only appears on per-module
result events (`moduleResultPresented`), never as a final verdict.

## Webhook events

Sumsub `POST`s JSON to your configured URL. Headers:

- `x-payload-digest` — hex HMAC of the raw body.
- `x-payload-digest-alg` — `HMAC_SHA1_HEX` | `HMAC_SHA256_HEX` | `HMAC_SHA512_HEX`.
- Signing secret is the **webhook secret** (set per webhook in the
  dashboard), not the App Token secret.

Verify on raw bytes, before JSON parsing.

| `type` | When | Key payload |
|---|---|---|
| `applicantCreated` | First token mint for an `externalUserId` | `applicantId`, `inspectionId`, `levelName`, `externalUserId`, `reviewStatus: init`, `clientId` |
| `applicantPending` | Docs uploaded, processing begins | applicant ids, `levelName`, optional `reviewMode` |
| `applicantPrechecked` | Primary data processing done | `reviewStatus: queued`, optional `reviewMode` |
| `applicantOnHold` | Paused (typically AML) | `reviewResult`, `reviewStatus: onHold`, optional `reviewMode` |
| `applicantReviewed` | **Final verdict.** | `reviewResult` (with `reviewAnswer`, `rejectLabels[]`, `reviewRejectType`, `buttonIds[]`) |
| `applicantPersonalInfoChanged` | User edited info post-submission | `reviewResult`, current `reviewStatus` |
| `applicantActionPending` / `applicantActionReviewed` | Per-action lifecycle | `applicantActionId`, `externalApplicantActionId`, `reviewResult` |
| `applicantWorkflowCompleted` | Multi-level workflow finished | `reviewResult` |

### `reviewRejectType` (on `RED`)

- `FINAL` — verification is over; do not let the user retry.
- `RETRY` — user may upload again. `rejectLabels` tells them why.

### `rejectLabels` you'll see most

- `BLOCKLIST` — user is on a Sumsub block list (often AML).
- `WRONG_USER_REGION` — country gating.
- `DOCUMENT_PAGE_MISSING` / `DOCUMENT_DAMAGED` / `BAD_PHOTO` — UX guidance.
- `SCREENSHOTS` — accepted only if level explicitly allows it.
- `FORGERY` / `INCONSISTENT_PROFILE` — fraud signals.

The dashboard's level builder shows the full catalog under "Reject reasons".

## Idempotency

Webhooks can arrive twice. Key your DB upserts by
`(applicantId, type, createdAt)` or by `applicantId` + a version field —
never insert blindly.

## Order

Sumsub does **not** guarantee strict ordering. `applicantReviewed` can
arrive before `applicantPending` in pathological cases. Your state machine
should be order-independent: always trust the latest `reviewStatus` /
`reviewResult` on the applicant, not the sequence of webhooks.
