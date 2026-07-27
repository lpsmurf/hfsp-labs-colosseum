# ARD Architecture Guide (v0.9 Compliant)

This document explains how the HFSP Labs / Clawdrop platform is wired into the
Agentic Resource Discovery (ARD) specification v0.9, what each file does, and the
rules Codex must follow when adding or updating skills and services.

---

## What ARD Is (one paragraph)

ARD is the discovery layer that sits in front of MCP, Skills, and A2A.
Instead of requiring agents to pre-install tools, ARD lets any agent search a
federated registry at runtime using natural language and receive ranked,
ready-to-use capabilities. Publishers advertise via a static `ai-catalog.json`
file at a well-known URL. Registries crawl those manifests and expose a
standard REST search API.

Spec: https://agenticresourcediscovery.org
HF implementation: https://github.com/huggingface/hf-discover
GitHub Agent Finder: https://github.com/ards-project/ard-spec

---

## File Map

```
hfsp-labs-colosseum/
├── .well-known/
│   └── ai-catalog.json          # ARD static manifest — must be spec-correct
│                                 # Host at: hfsp.cloud/.well-known/ai-catalog.json
│
├── skills/
│   └── clawdrop/
│       ├── SKILL.md             # agentskills.io skill
│       ├── agents.md            # HF Hub adapter file
│       └── references/          # Progressive disclosure
│
├── .skills-inject.json
│
└── marketplace/
    ├── pay-skills/providers/hfsp/
    └── providers/openclaw/agents/
```

---

## How the Layers Connect

```
  AGENT (Claude Code / Codex / custom)
       │
       │  1. "I need to buy a gift card with USDC"
       ▼
  ARD REGISTRY  (HF Discover / GitHub Agent Finder / custom)
       │  POST /search  →  queries ai-catalog.json manifests
       │
       │  2. Returns: hfsp-store skill entry
       ▼
  SKILL.md / agents.md / OpenAPI
       │
       │  3. Agent loads skill instructions and payable operation metadata
       │
       │  4. Agent calls POST https://store.hfsp.cloud/api/orders
       ▼
  x402 PAYMENT FLOW  →  USDC on Solana  →  voucher code delivered
```

---

## Spec-correct manifest rules

The repository must use the ARD v0.9 structure:

- Root keys: `specVersion`, `host`, `entries`
- Each entry must include: `identifier`, `displayName`, `type`, and exactly one of `url` or `data`
- `identifier` must use the domain-anchored URN format: `urn:air:<publisher>:<namespace>:<name>`
- Use `representativeQueries` (camelCase), not `representative_queries`
- Use `displayName`, not `title`

Recommended host block:

```json
{
  "specVersion": "1.0",
  "host": {
    "displayName": "HFSP Labs",
    "identifier": "did:web:hfsp.cloud",
    "documentationUrl": "https://clawdrop.live"
  }
}
```

---

## Payment discovery layer

Payment discovery is a separate layer from ARD search.

- ARD answers: "What service should I use?"
- OpenAPI payment extensions answer: "Is this endpoint paid, and what method should I expect?"
- x402 answers: "What exact amount and recipient are authoritative right now?"

Rules:

- Add `x-service-info` once per OpenAPI document
- Add `x-payment-info` to each payable operation
- Include a `402` response on each payable operation
- Treat OpenAPI payment metadata as advisory and the live 402 response as authoritative

---

## Discovery methods

HFSP should publish the manifest through all supported discovery mechanisms:

1. Well-known URI:
   `https://hfsp.cloud/.well-known/ai-catalog.json`
2. `robots.txt` directive:
   `Agentmap: https://hfsp.cloud/.well-known/ai-catalog.json`
3. HTML link tag on the homepage:
   `<link rel="ai-catalog" href="https://hfsp.cloud/.well-known/ai-catalog.json">`

---

## Validation and conformance

Before registry submission, validate the manifest with the ARD conformance tool:

```bash
./conformance/bin/conformance-test manifest https://hfsp.cloud/.well-known/ai-catalog.json
```

Recommended additional validation:

```bash
npx ajv-cli validate -s spec/schemas/ai-catalog.schema.json -d .well-known/ai-catalog.json
```

---

## Codex Implementation Rules

### Adding a new service
1. Create `marketplace/pay-skills/providers/hfsp/<service-name>/PAY.md` with
   `license`, `compatibility`, `## Agent safety`, `## Spend-aware usage` sections
2. Add the service to `skills/clawdrop/SKILL.md` platform overview table
3. Add a `references/<service-name>.md` file under `skills/clawdrop/references/`
4. Add the service entry to `.well-known/ai-catalog.json` under `entries`
5. Update `skills/clawdrop/agents.md` description and trigger phrases
6. Bump `metadata.version` in `skills/clawdrop/SKILL.md`

For every new ARD entry, Codex must also:

- Mint a stable URN identifier under `urn:air:hfsp.cloud:*`
- Add 2 to 5 `representativeQueries`
- Prefer `metadata.serviceUrl` and `metadata.openapiUrl` for service linkage

For every new paid endpoint, Codex must also:

- Add `x-payment-info`
- Add `402` response documentation
- Keep the 402 runtime flow aligned with the documented payment method

---

## ARD Compliance Checklist

- [ ] `ai-catalog.json` hosted at `hfsp.cloud/.well-known/ai-catalog.json`
- [ ] Root object uses `specVersion`, `host`, `entries`
- [ ] All entries have `identifier`, `displayName`, `type`, and exactly one of `url` or `data`
- [ ] Every identifier follows `urn:air:hfsp.cloud:*`
- [ ] `representativeQueries` present for discoverability
- [ ] `agents.md` present at `skills/clawdrop/agents.md`
- [ ] `SKILL.md` frontmatter includes `name`, `description`, `license`, `compatibility`
- [ ] All `PAY.md` files include `license`, `compatibility`, `## Agent safety`
- [ ] `SKILL.md` body includes explicit agent safety guardrails
- [ ] `references/` files linked from `SKILL.md` progressive disclosure section
- [ ] `.skills-inject.json` at repo root pointing to `skills/clawdrop`
- [ ] nginx serves `.well-known/` with correct Content-Type and CORS headers
- [ ] `robots.txt` publishes an `Agentmap:` line
- [ ] Homepage includes `<link rel="ai-catalog">`
- [ ] Payable OpenAPI operations include `x-payment-info` and `402` responses
- [ ] Manifest passes ARD conformance validation before submission
