# ZK Deployment — Kimi Handoff

**Feature:** Zero-Knowledge Credential Storage  
**Spec location:** `/Users/mac/claude/zk-deployment-spec/` (5 documents)  
**Start with:** T-001 in `TASKS.md`  
**Branch:** `kimi/zk-deployment`

---

## What This Feature Is

Users deploy agents that need secrets (Telegram token, OpenRouter key). Today the platform holds those secrets server-side (in `key-vault.ts` with a `VAULT_ENCRYPTION_KEY` env var — the server CAN read them). 

The ZK feature flips this: **secrets are encrypted in the browser using the user's wallet signature as the key derivation input. The server never has the plaintext key and never sees the plaintext credential.**

The flow:
1. User connects Phantom → signs a deterministic message → HKDF derives AES key in-browser
2. Browser encrypts credentials → POSTs ciphertext blob to `/vault/store`
3. At spawn time: browser decrypts locally → POSTs **plaintext** credentials over HTTPS to `/agent/spawn`
4. Backend receives plaintext, injects into Docker `--env`, never logs/stores it
5. Plaintext disappears from server memory after container starts

---

## Repo Audit — What Already Exists

### Keep / Reuse
| File | Relevant for ZK |
|------|----------------|
| `packages/clawdrop-platform/src/db/index.ts` | **Add two new tables here** (`credential_vault`, `audit_log`) — do NOT create a new DB file |
| `packages/clawdrop-platform/src/services/docker-deployer.ts` | Has `docker run --env` logic — adapt `dockerService.ts` to call into this or replicate the pattern |
| `packages/trial-frontend/src/pages/Deploy.tsx:114` | Already calls `provider.signMessage(encoded, 'utf8')` — the ZK hook wraps this exact call |
| `packages/trial-frontend/src/services/api.ts` | Add `vaultClient` methods here |

### What Currently Does Server-Side Encryption (Replace/Ignore for ZK)
| File | Why It's Different |
|------|-------------------|
| `packages/clawdrop-platform/src/services/key-vault.ts` | Server-held AES key via `VAULT_ENCRYPTION_KEY`. **ZK replaces this for credential storage** (but `key-vault.ts` may still be used for internal secrets — don't delete it) |

### What Does NOT Exist Yet (Create Fresh Per Spec)
- `src/crypto/types.ts` — T-003
- `src/crypto/keyDerivation.ts` — T-004/T-005
- `src/crypto/credentialVault.ts` — T-007/T-008/T-009
- `src/vault/vaultSchema.ts` — T-012 (tables go inside `db/index.ts` migration)
- `src/vault/vaultService.ts` — T-013
- `src/vault/vaultRouter.ts` — T-015
- `src/agent/dockerService.ts` — T-019
- `src/agent/logSanitizer.ts` — T-020
- `src/agent/spawnHandler.ts` — T-021
- `packages/trial-frontend/src/hooks/useWalletEncryption.ts` — T-029
- `packages/trial-frontend/src/components/CredentialVault.tsx` — T-031
- `packages/trial-frontend/src/components/WalletWarningBanner.tsx` — T-030

---

## Integration Points

### 1. Database (CRITICAL — read this first)

The platform DB lives at `packages/clawdrop-platform/src/db/index.ts`. Migrations are run inside the `migrate()` function. **Add the two new tables at the bottom of that `db.exec(...)` block** — don't create a separate DB file.

Tables to add (from PLAN.md > Module 3):
```sql
CREATE TABLE IF NOT EXISTS credential_vault (
  id            TEXT PRIMARY KEY,
  user_pubkey   TEXT NOT NULL,
  agent_id      TEXT NOT NULL UNIQUE,
  encrypted_blob BLOB NOT NULL,
  nonce         BLOB NOT NULL,
  salt          BLOB NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  user_pubkey TEXT NOT NULL,
  agent_id    TEXT NOT NULL,
  action      TEXT NOT NULL,
  ip_address  TEXT,
  timestamp   INTEGER NOT NULL
);
```

### 2. Backend — Where to Mount Routes

`packages/clawdrop-platform/src/server.ts` (or `index.ts`) mounts all routers. Add:
```typescript
import vaultRouter from './vault/vaultRouter.js';
import spawnRouter from './agent/spawnHandler.js';
app.use('/vault', vaultRouter);
app.use('/agent', spawnRouter);
```

### 3. Frontend — Wallet Adapter vs Raw Phantom

The spec calls for `@solana/wallet-adapter-react`. However, the existing `Deploy.tsx` uses **raw Phantom window injection** (`window.solana`). The `signMessage` call at line 114 uses `provider.signMessage(encoded, 'utf8')`.

**Decision for Kimi:** Use the same raw Phantom approach already in the codebase (no need to add wallet-adapter boilerplate). The `useWalletEncryption` hook should call `window.solana.signMessage(messageBytes)` directly, matching the existing pattern. If the user doesn't have Phantom, show the same "Install Phantom" button already in Deploy.tsx (line 102).

### 4. Spawn Endpoint vs Existing Deploy Flow

The existing `/api/agents/deploy` and `/api/agents/quick-deploy` in `agents.ts` handle spawning. For ZK, the **spawn endpoint is separate** (`/agent/spawn`) because it receives pre-decrypted credentials from the browser. It does NOT go through the subscription/payment gate — spawning assumes the vault entry already exists (user already paid and stored credentials).

### 5. Docker `--log-driver none`

The existing `docker-deployer.ts` does NOT set `LogConfig`. The new `dockerService.ts` (T-019) MUST set `LogConfig: { Type: 'none' }` per the spec (CLARIFICATION CLR-06). Add this to the new ZK spawn path only — don't change the existing deployer.

---

## Dependencies to Install

**Backend** (in `packages/clawdrop-platform/`):
```bash
npm install dockerode uuid
npm install -D @types/dockerode
```
`better-sqlite3` is already installed.

**Frontend** (in `packages/trial-frontend/`):
```bash
npm install @noble/ciphers @noble/hashes
```
`@solana/web3.js` is already installed. Do NOT add `@solana/wallet-adapter-react` — use raw Phantom.

---

## Architecture Note on HKDF

The spec (CLARIFICATION CLR-01) requires the signed message to include `agentId`. Look at the existing `signMessage` call in `Deploy.tsx:111-114`:
```typescript
const msg = 'Clawdrop login';
const encoded = new TextEncoder().encode(msg);
const { signature } = await provider.signMessage(encoded, 'utf8');
```
For ZK, the message MUST be:
```
Clawdrop credential vault access — v1
Agent: {agentId}
Wallet: {publicKey}
```
This produces a different signature than the auth message, which is correct — credential key derivation is scoped per agent.

---

## File Structure to Create

All backend ZK files go inside `packages/clawdrop-platform/src/`:
```
src/
  crypto/
    types.ts           ← T-003 (shared types, used by both frontend + backend)
    keyDerivation.ts   ← T-004 (HKDF, browser-only — put in frontend)
    credentialVault.ts ← T-007 (AES-256-GCM encrypt/decrypt, browser-only — put in frontend)
  vault/
    vaultService.ts    ← T-013 (SQLite CRUD)
    vaultRouter.ts     ← T-015 (Express routes)
  agent/
    dockerService.ts   ← T-019 (Docker spawn with --log-driver none)
    logSanitizer.ts    ← T-020 (Express middleware)
    spawnHandler.ts    ← T-021 (POST /agent/spawn)
```

Frontend ZK files go inside `packages/trial-frontend/src/`:
```
src/
  crypto/
    types.ts           ← shared with backend spec (duplicate or share via workspace)
    keyDerivation.ts   ← T-004 (HKDF, runs in browser)
    credentialVault.ts ← T-007 (AES-256-GCM, runs in browser)
  hooks/
    useWalletEncryption.ts ← T-029
  components/
    CredentialVault.tsx    ← T-031
    WalletWarningBanner.tsx ← T-030
```

---

## What NOT to Break

- `packages/clawdrop-platform/src/services/key-vault.ts` — still used by `llm-router.ts` for OpenRouter key encryption. Do not modify it.
- `packages/clawdrop-platform/src/routes/agents.ts` — existing deploy/quick-deploy routes still work. ZK spawn is additive.
- `packages/trial-frontend/src/pages/Deploy.tsx` — existing 8-step wizard still works. ZK credential form can be added as a new step or separate route (`/deploy/secure`).

---

## Start Here: T-001

```bash
cd packages/trial-frontend
npm install @noble/ciphers @noble/hashes

cd ../clawdrop-platform
npm install dockerode uuid
npm install -D @types/dockerode
```

Then create `src/crypto/types.ts` (T-003), then `keyDerivation.ts` (T-004/T-005).

Verify determinism: same wallet sig + same salt + same agentId → same 32-byte key output.

---

## Spec Files (read in this order)
1. `CONSTITUTION.md` — 8 principles, acceptance gate
2. `CLARIFICATION.md` — 8 resolved design decisions (CLR-01 through CLR-08)
3. `SPECIFICATION.md` — 6 user stories + functional requirements
4. `PLAN.md` — module breakdown + file structure
5. `TASKS.md` — 38 checkboxed tasks, start at T-001
