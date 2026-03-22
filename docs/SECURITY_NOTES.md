# Security notes (v1)

## Isolation
- 1 Docker container per tenant
- No shared workspace folders
- No shared secrets directories
- Resource limits per container

## Secrets
- Bot token + provider keys encrypted at rest in DB
- Decrypt only when writing into tenant container secrets
- Never log raw tokens/keys (redact)

## Pairing
- Telegram DM policy: pairing
- Approve pairing inside tenant runtime only after storefront bot receives pairing code from the owner

## Beta abuse controls
- 1 live tenant per Telegram user (configurable)
- Provisioning attempts per day limit
- Idle tenant reaper (optional)
