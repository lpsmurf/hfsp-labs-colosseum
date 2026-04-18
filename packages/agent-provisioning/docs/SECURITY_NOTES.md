# Security notes (beta) — current + TODOs

## Isolation (implemented)
- 1 Docker container per tenant
- Tenant base dir: `/opt/hfsp/tenants/<tenant_id>/`
- Per-tenant:
  - `workspace/` bind-mounted to `/tenant/workspace`
  - `secrets/` bind-mounted read-only to `/home/clawd/.openclaw/secrets`
  - `openclaw.json` bind-mounted read-only to `/home/clawd/.openclaw/openclaw.json`

## Secrets (partially implemented)
- Bot token + provider keys are stored in SQLite wizard_state during setup (plaintext in DB **today**).
- On provisioning they are written to per-tenant secret files on the tenant VPS.
- Logging: do not print raw tokens/keys.

TODO (high priority):
- Encrypt secrets at rest in SQLite (wizard_state + any tenant metadata).
- Add redaction helper for any error messages that might contain secrets.

## Pairing (implemented)
- Telegram DM policy: `pairing`
- Storefront bot approves pairing by executing inside the tenant container as `clawd` with `HOME=/home/clawd`.

## Dashboard access (implemented)
- Dashboard is bound to tenant VPS loopback only (127.0.0.1) and accessed via SSH tunnel.
- Tunnel keys are generated per tenant and sent to the user.
- SSH/tunnel instructions are shown only behind "Dashboard access (Advanced)".

## Abuse controls (TODO)
- Per-user tenant limits, rate limiting, idle reaper, and audit logging are not implemented yet.
