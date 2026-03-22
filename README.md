# HFSP Clawbot Provisioning (Beta)

Telegram-first control plane that provisions **one isolated OpenClaw runtime per customer**.

## Beta goals
- Zero paywall (beta): fastest path to users testing value
- Create a customer-owned Telegram bot (BYO BotFather token)
- Let users connect OpenAI via **OpenClaw `openai-codex` OAuth** (best-effort) or fall back to API key
- Template-based agent packs
- Pairing-based DM security (`dmPolicy: pairing`)

## Architecture (v1)
- **Storefront Bot** (Telegram): onboarding wizard + status + basic management
- **Provisioner** service: creates tenant record, starts Docker container, writes config/secrets, starts gateway
- **Tenant runtime**: one container per tenant, isolated workspace + secrets
- **OAuth callback web**: small web service to complete OAuth for a tenant runtime and return success/failure

## Key flows
- Create tenant → receive BotFather token → choose template → choose connect method (OAuth/API key) → provision container → pairing → live

See `docs/` for UX scripts, state machine, and security notes.
