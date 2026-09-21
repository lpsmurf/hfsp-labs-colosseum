# Private Disclosure Draft — base-intel-api Payment Bypass

**Status:** READY TO SEND · not yet sent
**Channel:** private first (email / DM / private GitHub security advisory) — NOT a public issue
**Recipient:** operator handle `jakemaxsigal` (from the `*.jakemaxsigal.workers.dev` subdomain)
**Embargo:** request a fix; hold any public mention until fixed or 90 days, whichever first.

---

## How to reach them (find one of these first)

- [ ] GitHub: search `github.com/jakemaxsigal` → look for the repo behind the worker → use **Security → Report a vulnerability** (private advisory) if enabled, else open a minimal issue asking for a private contact.
- [ ] Email: check the worker's `/` root, any `/.well-known/`, README, or x402 listing metadata for a contact address.
- [ ] x402 marketplace listing (agentic.market) — may have an operator contact / social link.
- [ ] X/Twitter or Farcaster handle matching `jakemaxsigal`.

---

## Message (copy-paste, fill the contact in)

> **Subject:** Security: your x402 endpoint serves paid data for free (payment not verified)
>
> Hi — I'm with HFSP Labs. We run automated AI agents that pay for x402 services, and
> while testing the ecosystem we found a payment-bypass bug in `base-intel-api.jakemaxsigal.workers.dev`.
> Flagging it privately so you can fix it before anyone abuses it.
>
> **The bug:** the `/bankr/score` endpoint gates on whether the `X-PAYMENT` header is
> *present*, not whether it's a *valid, settled* payment. Any non-empty value returns the
> full paid dataset, so the API is effectively free.
>
> **Reproduce (no payment, just a junk header):**
> ```bash
> # No header → correctly gated
> curl -s -o /dev/null -w "%{http_code}\n" \
>   https://base-intel-api.jakemaxsigal.workers.dev/bankr/score
> # → 402
>
> # Any garbage header → full paid data
> curl -s -H "X-PAYMENT: x" \
>   https://base-intel-api.jakemaxsigal.workers.dev/bankr/score
> # → 200 + full launch dataset
> ```
> I tested three invalid values (`x`, `12345`, 88×`a`) — all returned live data. No
> on-chain settlement happens.
>
> **Fix:** verify the payment instead of just checking the header exists — base64-decode
> `X-PAYMENT`, verify the signature + that `payTo`/`amount`/`asset`/`network` match your
> quote, and confirm settlement via an x402 facilitator before serving content. Reject
> failures with `402`, not `200`. Ref: https://docs.cdp.coinbase.com/x402/welcome
>
> Happy to share more detail or test a patch. We'll hold off on any public write-up until
> you've had a chance to fix it (say 90 days). Let me know if you'd like a hand.
>
> — HFSP Labs · info@hfsp.xyz

---

## Log

| Date | Action | Outcome |
|------|--------|---------|
| 2026-06-06 | drafted | — |
| 2026-06-07 | contact search | No email on landing page. GitHub: `jakemaxsigal` exists (0 repos, no contact). `jakemaxsigal-creator` also exists (0 repos). Not found in coinbase/x402 ecosystem PRs. |
| 2026-06-07 | next step | Try @jakemaxsigal on X/Twitter — DM draft ready in cors-credentials-cluster.md |
|  | sent | — |
|  | response | — |
|  | fix confirmed | — |
