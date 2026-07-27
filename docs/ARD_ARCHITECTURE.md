# ARD Architecture Guide

This document explains how the HFSP Labs / Clawdrop platform is wired into the
Agentic Resource Discovery (ARD) specification, what each file does, and the
rules Codex must follow when adding or updating skills and services.

---

## What ARD Is (one paragraph)

ARD is the discovery layer that sits in front of MCP, Skills, and A2A.
Instead of requiring agents to pre-install tools, ARD lets any agent search a
federated registry at runtime using natural language — and get back ranked,
ready-to-use capabilities. Publishers advertise via a static `ai-catalog.json`
file at a well-known URL. Registries (HuggingFace Discover, enterprise intranets,
etc.) crawl those manifests and expose a `POST /search` endpoint. Clients call
that endpoint with intent and receive matching catalog entries.

Spec: https://agenticresourcediscovery.org
HF implementation: https://github.com/huggingface/hf-discover

---

## File Map

```
hfsp-labs-colosseum/
├── .well-known/
│   └── ai-catalog.json          # ARD static manifest — your front door
│                                 # Host at: hfsp.cloud/.well-known/ai-catalog.json
│
├── skills/
│   └── clawdrop/
│       ├── SKILL.md             # agentskills.io skill — consumed by Claude Code,
│       │                         # Codex, Gemini CLI, Cursor via `npx skills add`
│       ├── agents.md            # HF Hub adapter file — Discover reads this and
│       │                         # auto-wraps it as application/ai-skill
│       └── references/          # Progressive disclosure — read on demand
│           ├── hfsp-store.md
│           ├── vpn-x402.md
│           ├── openclaw.md
│           ├── x402-protocol.md
│           └── x402-audit.md
│
├── .skills-inject.json          # agentskills.io discovery registration
│
└── marketplace/
    ├── pay-skills/providers/hfsp/   # pay-skills catalog (Solana Foundation)
    │   ├── hfsp-store/PAY.md
    │   └── vpn-x402/PAY.md
    └── providers/openclaw/agents/   # other marketplace providers
        └── PAY.md
```

---

## How the Layers Connect

```
  AGENT (Claude Code / Codex / custom)
       │
       │  1. "I need to buy a gift card with USDC"
       ▼
  ARD REGISTRY  (HF Discover / custom registry)
       │  POST /search  →  queries ai-catalog.json manifests
       │
       │  2. Returns: hfsp-store skill entry  (application/ai-skill)
       ▼
  SKILL.md / agents.md  (served from this repo / hfsp.cloud)
       │
       │  3. Agent loads skill instructions
       │
       │  4. Agent calls  POST https://store.hfsp.cloud/api/orders
       ▼
  x402 PAYMENT FLOW  →  USDC on Solana  →  voucher code delivered
```

---

## The Three File Types — When to Use Which

### `ai-catalog.json`  (ARD layer)
- **What:** Static JSON manifest at `.well-known/ai-catalog.json`
- **Who reads it:** ARD registries (HF Discover, enterprise crawlers)
- **When to update:** Any time you add or rename a service, change a service URL,
  or add a new skill
- **Rule:** Every service entry must have `mediaType`, `url`, `name`, `description`,
  and `tags`. Use `application/ai-skill` for skills, `application/mcp-server+json`
  for MCP servers.

### `agents.md`  (HuggingFace Hub layer)
- **What:** Markdown file that HF Discover reads and auto-wraps as `application/ai-skill`
- **Who reads it:** HF Discover adapter specifically
- **When to update:** When skill trigger phrases, descriptions, or flow changes
- **Rule:** Keep it under 500 lines. Focus on WHAT the skill does and WHEN to
  invoke it. Detailed flows go in `references/`. Mirror the `SKILL.md` description
  field exactly so both are in sync.

### `SKILL.md`  (agentskills.io layer)
- **What:** Full skill instructions consumed by Claude Code, Codex, Gemini CLI, Cursor
- **Who reads it:** Coding agents via `npx skills add lpsmurf/hfsp-labs-colosseum`
- **When to update:** When operating procedures, safety guardrails, or service
  URLs change
- **Rule:** Must have valid YAML frontmatter with `name`, `description`, `license`,
  `compatibility`. Body must include agent safety guardrails and progressive
  disclosure links to `references/`.

---

## Codex Implementation Rules

### Adding a new service
1. Create `marketplace/pay-skills/providers/hfsp/<service-name>/PAY.md` with
   `license`, `compatibility`, `## Agent safety`, `## Spend-aware usage` sections
2. Add the service to `skills/clawdrop/SKILL.md` platform overview table
3. Add a `references/<service-name>.md` file under `skills/clawdrop/references/`
4. Add the service entry to `.well-known/ai-catalog.json` under `catalog.entries`
5. Update `skills/clawdrop/agents.md` description and trigger phrases
6. Bump `metadata.version` in `skills/clawdrop/SKILL.md`

### Changing a service URL
1. Update `service_url` in the relevant `PAY.md`
2. Update the URL in `.well-known/ai-catalog.json` entry
3. Update the URL in the relevant `references/*.md` file
4. Update the URL in `skills/clawdrop/SKILL.md` platform overview table

### Payment address change (USDC recipient)
1. Update `payTo` address in the relevant `PAY.md` Payment details section
2. Update the address in `skills/clawdrop/references/x402-protocol.md` if it
   is the canonical recipient
3. Never commit private keys — only wallet addresses

### Deploying to production
- The `.well-known/ai-catalog.json` file in this repo must be served at
  `https://hfsp.cloud/.well-known/ai-catalog.json` with
  `Content-Type: application/json` and `Access-Control-Allow-Origin: *`
- Add the nginx rule: `location /.well-known/ { alias /var/www/hfsp/.well-known/; }`
- Validate with: `curl https://hfsp.cloud/.well-known/ai-catalog.json`
- Register with HF Discover: `hf discover search "buy gift cards with USDC"
  --registry-url https://hfsp.cloud/.well-known/ai-catalog.json`

---

## ARD Compliance Checklist

- [ ] `ai-catalog.json` hosted at `hfsp.cloud/.well-known/ai-catalog.json`
- [ ] All entries have `mediaType`, `url`, `name`, `description`, `tags`
- [ ] `agents.md` present at `skills/clawdrop/agents.md`
- [ ] `SKILL.md` frontmatter includes `name`, `description`, `license`, `compatibility`
- [ ] All `PAY.md` files include `license`, `compatibility`, `## Agent safety`
- [ ] `SKILL.md` body includes explicit agent safety guardrails
- [ ] `references/` files linked from `SKILL.md` progressive disclosure section
- [ ] `.skills-inject.json` at repo root pointing to `skills/clawdrop`
- [ ] nginx serves `.well-known/` with correct Content-Type and CORS headers
- [ ] MCP server Space (if published to HF) tagged `mcp-server`
