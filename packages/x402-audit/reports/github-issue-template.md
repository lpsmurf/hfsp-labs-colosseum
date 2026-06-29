# GitHub Issue Template — x402 Bug Report

Use this template when filing issues on service providers' GitHub repos.

---

## Title format

```
[x402] <short bug description>
```

Examples:
- `[x402] 402 response missing x402Version field`
- `[x402] Payment accepted but response returns 500`
- `[x402] Replay attack: same signature accepted twice`

---

## Issue body template

```markdown
## Summary

We are independently auditing x402-compatible services to help improve the ecosystem.
During our testing of your service, we found the following issue.

## Environment

- **Service:** [your service name]
- **Endpoint:** `POST https://your-api.com/endpoint`
- **Network:** Base / Solana
- **Date tested:** YYYY-MM-DD
- **x402 spec version:** 1

## Steps to Reproduce

1. Send a request to `https://your-api.com/endpoint` without a payment header
2. Observe the 402 response:
   ```json
   { ... paste 402 response ... }
   ```
3. [next step]

## Expected Behavior

[Describe what the x402 spec requires]

Reference: https://docs.cdp.coinbase.com/x402/welcome

## Actual Behavior

[What actually happened]

## Evidence

```bash
# Reproduce with:
curl -X POST https://your-api.com/endpoint \
  -H "Content-Type: application/json" \
  -d '{ ... }'

# Response:
{ ... }
```

## Impact

[Brief: does this break automated agents? Cause double charges? Allow replay attacks?]

## About Us

We are HFSP Labs, building autonomous AI agents that pay for services via x402.
We are auditing the ecosystem to improve interoperability and reliability for everyone.

Contact: info@hfsp.xyz | GitHub: [hfsp-labs](https://github.com/hfsp-labs)
```

---

## Severity guide

| Severity | When to use |
|----------|-------------|
| **Critical** | Security issue (replay attack possible, double charge, funds at risk) |
| **High** | Breaks x402 spec, agents can't use the service |
| **Medium** | Non-spec-compliant 402 response, degraded functionality |
| **Low** | Missing docs, incorrect pricing display, minor UX |

---

## After filing

1. Add issue URL to `STATUS.md` findings index
2. Add issue URL to the service's `findings/<id>.md`
3. Wait for response — follow up after 7 days if no reply
