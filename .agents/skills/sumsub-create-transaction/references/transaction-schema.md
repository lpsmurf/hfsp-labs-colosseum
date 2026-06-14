# KytTxnData — schema reference

Sources: Sumsub OpenAPI (`sumsub-openapi.json` → `components.schemas.KytTxnData` and the related `KytTxnInfo`, `KytTxnParticipant`, `KytTxnPaymentMethod`, `KytTxnCryptoParams`, `UserPlatformEventInfo`, etc.) plus the [official docs](https://docs.sumsub.com/reference/submit-transaction-for-existing-applicant.md).

## Endpoint routing

| Use case | Method + Path | Required query |
|---|---|---|
| Submit for an existing applicant | `POST /resources/applicants/{applicantId}/kyt/txns/-/data` | — |
| Submit and create the applicant on the fly | `POST /resources/applicants/-/kyt/txns/-/data` | `levelName=<name>` (and optionally `accessToken=<token>` for Device Intelligence) |

Both are marked `deprecated: true` in the OpenAPI but remain the canonical entry points in the Sumsub docs — no replacement exists.

The post script picks between them based on the spec's `_applicantId` or `_levelName` sidecar keys.

## Top-level `KytTxnData`

| Field | Type | Required | Notes |
|---|---|---|---|
| `txnId` | string | ✓ | Alphanumeric, unique on your side. Collision returns `409 Entity already exists` — use bulk-import to update. |
| `type` | enum | — (default `finance`) | `finance`, `travelRule`, `kyc`, `auditTrailEvent`, `userPlatformEvent`, `scheduledEvent`, `iGamingSession`. |
| `txnDate` | string | — | Format `yyyy-MM-dd HH:mm:ss+XXXX`, e.g. `2026-05-21 14:30:00+0000`. |
| `zoneId` | string | — | Time-zone name (e.g. `UTC+01:00`). |
| `info` | `KytTxnInfo` | ✓ for `finance`/`travelRule` | Amount, currency, direction, crypto params. See below. |
| `applicant` | `KytTxnParticipant` | ✓ | The person/entity acting on your platform. Must have `externalUserId`. |
| `counterparty` | `KytTxnParticipant` | — | Other side of the transaction. |
| `userPlatformEventInfo` | `UserPlatformEventInfo` | ✓ for `userPlatformEvent` | Event type + optional 2FA flag. |
| `sourceKey` | string | — | Source-key segregation. |
| `props` | `Map<string, string>` | — | Custom keys; values are stringified. |
| `orderId` | string | — | Optional. |
| `gamblingBonusChangeInfo` / `gamblingLimitChangeInfo` / `iGamingSessionInfo` / `auditTrailEventInfo` / `kytTxnKycInfo` / `triggerInfo` | objects | — | Specialized sub-objects for less-common transaction types; pass-through. |

## `KytTxnInfo`

| Field | Type | Required | Notes |
|---|---|---|---|
| `amount` | number | ✓ | |
| `currencyCode` | string | ✓ | ISO-4217 (`USD`, `EUR`, ...) or crypto ticker (`BTC`, `ETH`, ...). |
| `direction` | enum | ✓ | `in` (deposit/receive) or `out` (withdrawal/send). |
| `currencyType` | enum | — | `fiat` (default) or `crypto`. |
| `amountInDefaultCurrency` | number | — | Pre-converted amount in your client's default currency. |
| `defaultCurrencyCode` | string | — | The currency code that pairs with `amountInDefaultCurrency`. |
| `paymentDetails` | string | — | Remittance memo / reference text. |
| `paymentTxnId` | string | — | Blockchain tx hash for crypto. |
| `fingerprint` | string | — | Alternative blockchain identifier. |
| `mcc` | integer | — | 4-digit Merchant Category Code (fiat card payments). |
| `type` | string | — | Free-form sub-categorization (e.g. `payroll`, `bonus`). The skill exposes this as `infoType:` in the compact spec to avoid colliding with the top-level `type`. |
| `cryptoParams` | `KytTxnCryptoParams` | — | See below. |

### `KytTxnCryptoParams`

| Field | Type | Notes |
|---|---|---|
| `cryptoChain` | string | Mandatory for tokens, empty for native (BTC/ETH). See [chain codes](https://docs.sumsub.com/reference/crypto-chain-codes.md). |
| `contractAddress` | string | Smart-contract address (ERC-20, etc.). |
| `attemptId` | string | Identifier of a retry attempt. |
| `outputIndex` | integer | UTXO transactions. |

## `KytTxnParticipant` (used for both `applicant` and `counterparty`)

| Field | Type | Notes |
|---|---|---|
| `externalUserId` | string | **Effectively required** — `applicant.externalUserId` is mandatory; `counterparty.externalUserId` is recommended. Stable on your side; reuse across all txns for the same person. |
| `type` | enum | `individual` (default) or `company`. |
| `fullName` / `fullNameEn` | string | Required for companies; required by the "non-existing applicant" flow. |
| `firstName` / `firstNameEn` / `lastName` / `lastNameEn` | string | Individuals. |
| `nameType` | enum | `aliasName`, `birthName`, `maidenName`, `legalName`, `shortName`, `tradingName`, `other`. |
| `dob` | string | `YYYY-MM-DD`. |
| `placeOfBirth` | string | |
| `email` / `phone` | string | |
| `address` | `Address` | See below. |
| `device` | `KytTxnDevice` | `userAgent`, `sessionId`, `acceptLang`, `fingerprint`, `address`, `coords`, `ipInfo`. |
| `paymentMethod` | `KytTxnPaymentMethod` | See below. |
| `institutionInfo` / `institutionExtractedInfo` | `KytTxnInstitutionInfo` | `code`, `name`, `address`, `internalId` (VASP id from directory). |
| `idDoc` | `KytTxnParticipantIdDoc` | `number`, `country`, `idDocType`, `registrationAuthority`. |
| `companyType` / `registrationNumber` / `licenseNumber` / `leiCode` / `residenceCountry` | string | Company-specific. |
| `ceo` | `KytTxnParticipantName` | Names of CEO; used in Travel-Rule company counterparties. |

### `Address`

`country`, `postCode`, `town`, `street`, `subStreet`, `state`, `buildingName`, `flatNumber`, `buildingNumber`, `formattedAddress` (the builder accepts `formatted:` as a friendly alias).

### `KytTxnPaymentMethod`

| Field | Type | Notes |
|---|---|---|
| `type` | string | Free-form: `bankCard`, `bankAccount`, `crypto`, `cryptoWallet`, `eWallet`, `unhostedWallet`, `card`, `other`, etc. The builder forwards whatever you supply — the docs and live data accept far more values than any narrow enum would. |
| `accountId` | string | IBAN / card-last4 hash / wallet address / DC hash. |
| `accountIdHash` | string | Pre-computed hash if you don't want to send raw. |
| `issuingCountry` | string | ISO-3 alpha-3 (`USA`, `DEU`). |
| `subType` | string | Sub-classification. |
| `memo` | string | Free-form. |
| `fingerprint` | string | Device/payment-method fingerprint. |
| `3dsUsed` / `2faUsed` | boolean | Authentication evidence. |

## `UserPlatformEventInfo` (for `type: userPlatformEvent`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | enum | ✓ | `login`, `failedLogin`, `signup`, `passwordReset`, `twoFaReset`, `general`. |
| `twoFaUsed` | boolean | — | |
| `passwordHash` | string | — | Hashed password (do NOT send raw). |

## Common gotchas

- **`txnId` collisions** — Sumsub will reject with `409 Entity already exists`. For updates, use the [bulk-import](https://docs.sumsub.com/reference/import-transaction-history.md) endpoint, not this one.
- **`levelName` URL-encoding** — names with `@`, `+`, or spaces must be URL-encoded in the query string. `post_transaction.sh` handles this.
- **Deprecated endpoints, still canonical** — both POST routes are marked deprecated but remain the only ways to submit a transaction. Don't rely on the deprecation marker.
- **`info.amount` precision** — use `amountInDefaultCurrency` for the client's default currency to avoid Sumsub re-converting at the wrong rate.
- **`crypto.chain` for tokens** — required for ERC-20 / TRC-20 / etc. Omit for native chains (BTC, ETH).
- **`institution.internalId`** — when set on a counterparty, Sumsub treats the named VASP as "expected counterparty" and folds it into Travel-Rule scoring.
- **`applicant.externalUserId` reuse** — Sumsub uses this id to link transactions to an applicant. The same user must always carry the same `externalUserId`; mismatches cause silent split profiles.
- **Response shape** — Sumsub returns the full `KytTxn` envelope including `score`, `reviewAnswer` (`GREEN`/`YELLOW`/`RED`), `riskLabels`, and any matched rules. `4xx` errors return `{description, code, errorName}`.
