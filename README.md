# HFSP Agent Provisioning (Beta)

Telegram-first control plane that provisions **one isolated OpenClaw runtime per customer (1 container per tenant)**.

## What exists today (working beta)
- Webhook-based Telegram storefront bot (`@hfsp_agent_bot`)
- Button-driven onboarding wizard (Back/Cancel patterns)
- BYO BotFather token + bot username
- Providers:
  - OpenAI (API key)
  - Claude / Anthropic (API key)
  - Others shown as *coming soon*
- Tenant provisioning to a separate tenant VPS:
  - creates `/opt/hfsp/tenants/<tenant_id>/...`
  - writes `openclaw.json` + secret files
  - starts `hfsp/openclaw-runtime:stable` container
- Mandatory DM pairing (`dmPolicy: pairing`) with auto-approve after user pastes the pairing code
- “My agents” list so users don’t lose track of previously created agents
- Dashboard access is **private-only** via SSH tunnel and is shown **only behind an “Advanced” button**

## What is intentionally NOT done yet
- Billing / paywall
- OAuth callback flow (OpenAI OAuth beta copy exists, but API key is the reliable path)
- Encryption-at-rest for secrets in SQLite (documented as TODO)
- Abuse controls (rate limits, idle reaper)

## Architecture (current)
- **Storefront bot** (Node/TS + Express webhook + SQLite): onboarding wizard + provisioning orchestration
- **Tenant runtime** (Docker): one container per tenant on the tenant VPS

### Tenant isolation
- No shared workspace folders
- No shared secrets directories

### Secrets handling (current)
- Secrets are written to per-tenant secret files on the tenant VPS and bind-mounted read-only into the container.
- Anthropic key is injected via `ANTHROPIC_API_KEY` env at container start (reliable for this OpenClaw build).

## Key flow (happy path)
1) User creates a bot in BotFather
2) User pastes token + bot username into storefront
3) Choose template + provider + API key + preset
4) Provision tenant container
5) User DMs their new bot → gets pairing code
6) User pastes pairing code into storefront → storefront auto-approves
7) Bot replies normally

## Troubleshooting (common beta issues)
- **Pairing failed**: make sure you paste the **8-character pairing code** (e.g. `A52X7ABQ`), not your Telegram user id.
- **Telegram 409 getUpdates conflict**: you reused the same BotFather token in multiple tenants. Create a new bot per agent/tenant.
- **“Something went wrong while processing your request”**: check tenant logs; common causes are workspace permissions and provider auth.

## Help during setup
The storefront bot includes a **Help** button. It answers setup questions without advancing the wizard, and can show common issues + how to fix them.

## Docs
- UX: `docs/UX_FLOW.md`
- State: `docs/STATE_MACHINE.md`
- Security reality + TODOs: `docs/SECURITY_NOTES.md`
