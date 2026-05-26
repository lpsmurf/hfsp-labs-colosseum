# Kimi — Code Audit & Bug Review Brief

**From:** Claude (orchestrator)  
**Date:** 2026-05-26  
**Branch to work on:** `kimi/code-audit`  
**PR target:** `main`

---

## What This Is

A full security + correctness audit of the Clawdrop monorepo. We just merged a large batch of work directly to `main` (ZK credential vault, wallet encryption, agent revocation, oobe-bounty) without a review pass. You are that review pass.

217 TypeScript files across 8 packages. Prioritize the recently-merged code — it carries the highest bug risk.

---

## Repo Structure (Quick Reference)

```
packages/
├── trial-api              Trial chatbot backend (Mastra + SendAI Agent Kit)
├── trial-frontend         Trial chatbot UI (React + Vite + wallet adapters)
├── clawdrop-platform      Subscriptions, Docker orchestration, ZK vault
├── clawdrop-mcp-server    Per-user MCP server (SendAI Agent Kit + x402)
├── clawdrop-agent-runtime Per-user Telegram agent (MCP client)
├── agent-provisioning     Mastra brain + Telegram wizard + storefront API
├── clawdrop-mcp           MCP gateway + CLI wizard + payment protocol
└── oobe-bounty            Ace Data Cloud bounty deliverable
```

---

## Recently Merged — Audit These First

| Area | Files |
|------|-------|
| ZK Credential Vault (backend) | `packages/clawdrop-platform/src/vault/vaultRouter.ts`, `vaultService.ts`, `vaultSchema.ts` |
| Agent credential broker | `packages/clawdrop-platform/src/agent/credentialBroker.ts`, `credentialBrokerRouter.ts`, `spawnHandler.ts` |
| Docker service | `packages/clawdrop-platform/src/agent/dockerService.ts` |
| Log sanitizer | `packages/clawdrop-platform/src/agent/logSanitizer.ts` |
| Wallet encryption (frontend) | `packages/trial-frontend/src/crypto/credentialVault.ts`, `keyDerivation.ts`, `types.ts` |
| Wallet encryption hook | `packages/trial-frontend/src/hooks/useWalletEncryption.ts` |
| New UI components | `packages/trial-frontend/src/components/CredentialVault.tsx`, `WalletWarningBanner.tsx` |
| Deploy page | `packages/trial-frontend/src/pages/DeployZK.tsx` |
| Agents page (revoke button) | `packages/trial-frontend/src/pages/Agents.tsx` |
| Vault API client | `packages/trial-frontend/src/services/api.ts` (VaultApiClient at bottom) |
| OOBE signal pipeline | `packages/oobe-bounty/src/services/signal-engine.ts`, `x402-payments.ts`, `ace-client.ts` |

---

## Audit Checklist

### 🔴 CRITICAL — Security

- [ ] **Vault auth replay attack** — `vaultRouter.ts`: Is the wallet-signed message domain-scoped? Does it include a nonce or timestamp to prevent replay? Can the same signature be reused across requests?
- [ ] **Private key in logs** — `credentialBroker.ts`, `spawnHandler.ts`, `logSanitizer.ts`: Verify key material is never logged. Verify `logSanitizer` actually strips the key byte pattern from Docker stdout/stderr.
- [ ] **Key zeroing** — `spawnHandler.ts`: After decrypting and injecting the private key into the container env, is the plaintext key zeroed/cleared from Node.js memory?
- [ ] **AES-GCM nonce uniqueness** — `credentialVault.ts` (frontend): Is a fresh random nonce generated per encryption call? Nonce reuse with the same key breaks AES-GCM completely.
- [ ] **Key derivation entropy** — `keyDerivation.ts`: Is the salt random and stored alongside the ciphertext? Is PBKDF2/scrypt iteration count sufficient?
- [ ] **Rate limiting bypass** — `trial-api/src/rate-limit.ts`: Is limiting scoped per wallet address or per IP? Can rotating IPs bypass it? Is the counter store in-memory (resets on restart) or persistent?
- [ ] **SQL injection** — `clawdrop-platform/src/db/index.ts`: All queries use parameterized statements? No string concatenation in WHERE clauses?

### 🟠 HIGH — Correctness Bugs

- [ ] **Docker container leak** — `dockerService.ts`: If `spawnHandler` fails mid-way (e.g., after container create but before start), is the half-created container cleaned up? What happens on network timeout?
- [ ] **Volume leak on revoke** — `dockerService.ts`: When an agent is revoked, are named volumes explicitly removed or left orphaned?
- [ ] **Budget double-spend race** — `trial-api/src/budget-guard.ts`: Is the budget decrement atomic with the LLM call dispatch? Under concurrent requests, can the budget go negative?
- [ ] **Guardrails bypass via streaming** — `trial-api/src/guardrails.ts`: Are guardrails checked before streaming begins, or could partial streamed output reach the client before a guardrail trips?
- [ ] **Chat state race** — `trial-frontend/src/hooks/useTrialChat.ts`: If a user sends two messages rapidly, do responses interleave? Is there an in-flight request guard?
- [ ] **x402 payment finality** — `oobe-bounty/src/services/x402-payments.ts`: Is payment confirmation checking on-chain finality or just transaction submission?

### 🟡 MEDIUM — Error Handling

- [ ] Unhandled Promise rejections in Express routes (async handlers missing try/catch)
- [ ] `setInterval` / background polling tasks without `.catch()` — will silently die on first error
- [ ] Docker SDK calls that don't handle `container not found` (404) gracefully
- [ ] Wallet adapter calls in frontend that don't handle wallet disconnect mid-flow (e.g. user disconnects during signing)
- [ ] Missing null checks on `publicKey` / `signMessage` before use in `useWalletEncryption.ts`

### 🟡 MEDIUM — Type Safety

- [ ] `as any` casts that hide real type errors
- [ ] API response types that are asserted without Zod runtime validation
- [ ] Untyped Docker SDK responses used directly in business logic

### 🟢 LOW — Performance

- [ ] `trial-frontend/vite.config.ts` — identify bundle bloat candidates; suggest dynamic `import()` for wallet adapters (they add ~300KB)
- [ ] SQLite queries without indexes on high-frequency filter columns (user ID, agent ID)
- [ ] Synchronous `better-sqlite3` calls inside async Express handlers — blocks the event loop under load

---

## Output Format

For each finding:

```
**[SEVERITY]** `file:line` — short description
→ Fix: what to change
```

- Group by severity: CRITICAL → HIGH → MEDIUM → LOW
- Prefix vault/crypto findings with 🔐
- End with a summary count per severity

---

## Out of Scope

- `packages/oobe-bounty/scripts/` (shell scripts)
- Missing test coverage (separate task)
- Documentation gaps

---

## How to Deliver

1. Create branch `kimi/code-audit` from `main`
2. Commit fixes directly (don't just report — fix what you can)
3. For findings you cannot safely auto-fix, add a `// AUDIT: <description>` comment at the line
4. Open a PR to `main` with the audit report in the PR body
