# Tenant state machine (beta) — current

This repo currently stores **wizard_state** separately from **tenants**.
The tenant record is created at provisioning time.

## Wizard steps (storefront bot)
See `docs/STATE_MACHINE.md` only as a conceptual reference — the canonical step list lives in `services/storefront-bot/src/index.ts` as `WizardStep`.

## Tenant lifecycle (conceptual)
- drafted (wizard not yet provisioned)
- provisioned (tenant container created)
- waiting_pair (until pairing approved)
- live (paired + can respond)
- stopped (future: container stopped)
- deleted (future)

## Key transitions
- draft → provisioned: after token + username + template + provider + key + preset
- provisioned → live: pairing approved

## Known failure modes
- Telegram 409 getUpdates conflict if two containers run the same BotFather token.
- Workspace EACCES if bind mount owner != container uid (fixed by post-`docker run` chown inside container).
- Provider auth store schema mismatch (fixed by exporting provider env vars in tenant runtime entrypoint for Anthropic).
