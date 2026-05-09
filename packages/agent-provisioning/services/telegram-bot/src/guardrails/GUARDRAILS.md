# Poly Guardrails Architecture

Defense-in-depth safety layer for the Poly Telegram bot.
Every message passes through a pipeline of 8 independent hooks before the agent acts or responds.

---

## Execution Flow

```
Telegram User Message
        │
        ▼
┌─────────────────────────────────┐  ONBOARDING
│ 0. Onboarding Gate              │  Block: no email yet → CTA prompt
└─────────────────────────────────┘
        │ (email verified)
        ▼
┌─────────────────────────────────┐  INTAKE PIPELINE
│ 1. Input Validation             │  Block: injection, length bomb, bad encoding
│ 2. Rate Limiter                 │  Block: >10msg/min or >60msg/10min per user
│ 3. Auth Guard                   │  Block: unpaired, inactive sub, zero credits
└─────────────────────────────────┘
        │ (all pass)
        ▼
   Agent Brain (LLM call)
        │
        ▼  (for each tool call the LLM requests)
┌─────────────────────────────────┐  TOOL PIPELINE  (runs 1–5x per message)
│ 4. Tool Allowlist               │  Block: any tool not in POLY_TOOLS
│ 5. Swap Guard                   │  Block: mainnet, bad address, high slippage
│                                 │  Confirm: amount > $10 USD
│ 6. Execution Timeout            │  Block: >5 tool calls or >60s elapsed
└─────────────────────────────────┘
        │ (all pass)
        ▼
   Tool executes on MCP server
        │
        ▼  (after LLM produces final response)
┌─────────────────────────────────┐  OUTPUT PIPELINE
│ 7. Output Sanitizer             │  Strip: private keys, API keys, PII, bad links
│ 8. Credit Guard                 │  Block: balance exhausted / Warn: balance low
└─────────────────────────────────┘
        │
        ▼
Telegram Response to User
```

---

## Hook Reference

| # | Hook | Stage | Decision Types | Key Thresholds |
|---|------|-------|----------------|----------------|
| 1 | Input Validation | Intake | allow / block | max 500 chars |
| 2 | Rate Limiter | Intake | allow / block | 10/min, 60/10min |
| 3 | Auth Guard | Intake | allow / block | $0.001 min credits |
| 4 | Tool Allowlist | Tool | allow / block | 15 allowed tools |
| 5 | Swap Guard | Tool | allow / block / confirm | $10 threshold, 5% slippage |
| 6 | Execution Timeout | Tool | allow / block | 5 calls, 60s total |
| 7 | Output Sanitizer | Output | sanitized | 4,000 char max |
| 8 | Credit Guard | Output | allow / block (+ notice) | $0.50 warn, $0.001 block |

---

## Decision Types

| Decision | Meaning | Action |
|----------|---------|--------|
| `allow` | Pass through unchanged | Continue pipeline |
| `block` | Hard stop | Send `userMessage` to Telegram, abort |
| `confirm_required` | Needs user approval | Send inline keyboard (✅/❌), pause |
| `sanitized` | Output was cleaned | Use `sanitizedText` instead of original |

---

## POLY_TOOLS Allowlist (15 tools)

Read-only:
- `get_token_price` `get_token_analytics` `get_token_metadata` `check_token_risk`
- `get_wallet_balance` `get_wallet_portfolio` `get_wallet_pnl` `get_wallet_transactions`
- `get_trending_crypto` `get_crypto_markets` `get_crypto_price` `get_market_overview` `search_crypto`

Transactional (devnet only):
- `swap_tokens`
- `get_wallet_transactions`

**Everything else on the 99-tool MCP server is blocked.**

---

## Using the Pipeline

```typescript
import {
  runIntakeGuardrails,
  runToolGuardrails,
  runOutputGuardrails,
  type GuardrailContext,
} from './guardrails/index.js';

// 1. Before sending to agent brain
const ctx: GuardrailContext = { chatId, userId, messageText, timestamp: Date.now() };
const intake = await runIntakeGuardrails(ctx);
if (!intake.allowed) {
  await sendTelegramMessage(chatId, intake.userMessage!);
  return;
}

// 2. Before each tool call
const toolCtx = { ...ctx, toolCall: { name, args } };
const toolCheck = await runToolGuardrails(toolCtx);
if (!toolCheck.allowed) {
  // Either block or confirm_required — userMessage has the right text
  if (needsConfirm) {
    await sendConfirmationButtons(chatId, toolCheck.userMessage!, pendingApproval);
  } else {
    await sendTelegramMessage(chatId, toolCheck.userMessage!);
  }
  return;
}

// 3. After LLM produces response
const output = await runOutputGuardrails(ctx, rawLlmResponse);
if (!output.allowed) {
  await sendTelegramMessage(chatId, output.userMessage!);
  return;
}

const finalText = output.notice
  ? `${output.sanitizedText}\n\n${output.notice}`
  : output.sanitizedText!;

await sendTelegramMessage(chatId, finalText);
```

---

## Startup Configuration (required)

```typescript
import { configurePairingLookup, configureCreditLookup } from './guardrails/index.js';

// Wire up DB lookup for pairing
configurePairingLookup(async (chatId) => {
  const row = db().prepare('SELECT * FROM telegram_pairings WHERE chat_id = ?').get(chatId);
  if (!row) return null;
  return {
    userId: row.user_id,
    paired: !!row.paired_at,
    subscriptionActive: true,       // check your subscriptions table
    creditsUsd: row.credits_usd,
  };
});

// Wire up OpenRouter balance check
configureCreditLookup(async (userId) => {
  const keyHash = getKeyHashForUser(userId); // from key_vault
  const res = await fetch(`https://openrouter.ai/api/v1/keys/${keyHash}`, {
    headers: { Authorization: `Bearer ${OPENROUTER_PROVISIONING_KEY}` },
  });
  const data = await res.json();
  return { remaining: data.data.limit - data.data.usage, limit: data.data.limit };
});
```

---

## Adding a New Hook

1. Create `NN-hook-name.ts` in this directory following the `GuardrailHook` signature
2. Add it to the right stage in `pipeline.ts`
3. Export it from `index.ts`
4. Add a row to the Hook Reference table above
5. Test with a unit test that covers allow, block, and edge cases

---

## Audit Trail

Every hook appends to the `audit[]` array in `PipelineResult`.
Log it on every message:

```typescript
logger.info({ audit: result.audit, chatId }, 'guardrail_pipeline_complete');
```

This gives you a per-message record of every decision for debugging, compliance, and abuse analysis.
