# Sumsub signing — pitfalls that yield `401 Invalid signature`

Quick triage for `{"description":"Invalid signature","code":401}` (or
`"description":"Token expired"`).

## Clock skew

`X-App-Access-Ts` must be within ~60 seconds of Sumsub's server time, in
**seconds** since the epoch. Common failure modes:

- Sending milliseconds (`date +%s%3N`) → instantly invalid.
- Host clock drift on a long-running container; sync with NTP.
- Reusing a timestamp from an earlier request — every request needs a fresh
  one. Caching the sig is fine; caching the ts is not.

## Body bytes vs body string

The signature must cover the **bytes on the wire**. Watch for:

- Heredocs / editors adding a trailing `\n` that `--data-binary` will send
  but your in-memory `json.dumps()` won't, or vice versa. Sign the file you
  pass to curl, not a re-serialised copy.
- Re-encoding (e.g. `json.dumps(json.loads(body))`) — key order, whitespace,
  and Unicode escaping can all change.
- Gzip / chunked encoding added by an HTTP client after you signed the
  uncompressed body. Disable compression on the request path used for signing.

For `GET` / `HEAD` / `DELETE` with no body, the signing-string body segment
is the empty string — append **nothing**, not `"null"` or `"{}"`.

## Path and query

- Path starts with `/`. Sign exactly what goes in the request line.
- Include the **full** query string, with the `?` and all params in the order
  you send them. URL-encoding must match: `+` vs `%20` differs.
- Do not include the scheme/host (`https://api.sumsub.com`).

## Method case

`GET`, `POST`, `PATCH`, `PUT`, `DELETE` — all uppercase. Lowercase `post` is
rejected.

## Token / secret pairing

- Tokens and secrets are environment-bound: a sandbox token signed with a
  sandbox secret only works against sandbox data. Mixing prod + sandbox is a
  common cause of `401`.
- The secret is shown **once** at creation. If it was lost, generate a new
  pair — there is no recovery flow.
- Trim whitespace; copy-paste from a PDF or chat can introduce trailing
  spaces or smart quotes.

## HTTPS only

Plain HTTP is rejected before signature validation. If you see a connection
reset or a redirect to HTTPS, fix the base URL first.

## Multipart uploads — sign the full raw body

There is no special "skip the body bytes for multipart" rule, despite a
recurring myth in older recipes. `multipart/form-data` requests are signed
the same as JSON: the entire raw body — boundaries, part headers, JSON
metadata, file bytes, trailing `--boundary--` — goes into the signing
string after `ts + METHOD + path`.

The trap is that high-level HTTP clients (`curl -F`, Python `requests`
with `files=`, browser `FormData`) generate the boundary themselves and
never expose the exact bytes they will send, so you cannot sign what
they'll transmit. The fix is to build the multipart body manually in
memory, sign those bytes, and then transmit the same bytes with a
low-level send (`urlopen` with explicit `Content-Type` carrying your
chosen boundary, or `curl --data-binary @raw-multipart.bin`). See
[`SKILL.md`](../SKILL.md#signing-multipartform-data-requests) for the
canonical Python recipe.

## Encoding the HMAC

The signature is the lowercase **hex** digest, not base64 and not the raw
bytes. `openssl dgst -sha256 -hmac ... -hex` returns `(stdin)= <hex>`; strip
the prefix (the helper script does `awk '{print $NF}'`).
