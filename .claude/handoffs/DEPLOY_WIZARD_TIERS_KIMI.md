## 2026-05-11 — CLAUDE → KIMI (Deploy Wizard Pricing Tiers)

**Task**: Add a "Free Trial" tier ($0.10 SOL to verify builders) and rename the existing paid plan to $29/mo in the deploy wizard

**Why $0.10**: Owner wants a tiny on-chain payment to filter real builders vs bots on the free tier. Paid wizard stays full featured at $29/mo.

---

### Tier Design

| Tier | ID | Price | Features |
|------|----|-------|----------|
| Free Trial | `free_trial` | $0.10 SOL (one-time) | 1 agent · 100K tokens/mo · Shared VPS · 7 days |
| Paid | `starter` | $29 USDC/mo (or SOL equivalent) | 1 agent · 1M tokens/mo · Shared VPS |

Remove the existing `pro` tier ($59) from the wizard for now — it's not ready.

---

### Files to Change

#### 1. `packages/trial-frontend/src/types/api.ts` — line 100

```typescript
// CURRENT:
export type SubscriptionTier = 'starter' | 'pro';

// CHANGE TO:
export type SubscriptionTier = 'free_trial' | 'starter';
```

#### 2. `packages/trial-frontend/src/pages/Deploy.tsx` — line 43-46

```typescript
// CURRENT:
const TIERS: { id: SubscriptionTier; name: string; price: string; description: string }[] = [
  { id: 'starter', name: 'Starter', price: '19 USDC / mo', description: '1 agent · 1M tokens/mo · Shared VPS' },
  { id: 'pro', name: 'Pro', price: '59 USDC / mo', description: 'Unlimited agents · 5M tokens/mo · Dedicated VPS' },
]

// CHANGE TO:
const TIERS: { id: SubscriptionTier; name: string; price: string; badge?: string; description: string }[] = [
  { id: 'free_trial', name: 'Free Trial', price: '0.10 SOL (one-time)', badge: '7 days', description: '1 agent · 100K tokens · Verify you are a builder' },
  { id: 'starter', name: 'Builder', price: '$29 / mo', description: '1 agent · 1M tokens/mo · Full access' },
]
```

Add a `badge` property rendering in the tier card inside `step === 'payment'` (line ~308-319):

```tsx
// After the tier name paragraph, add:
{tier.badge && (
  <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full ml-1">
    {tier.badge}
  </span>
)}
```

#### 3. `packages/trial-frontend/src/components/PaymentModal.tsx` — line ~30-31

```typescript
// CURRENT:
const TIER_LABELS: Record<SubscriptionTier, string> = {
  starter: 'Starter',
  pro: 'Pro',
}

// CHANGE TO:
const TIER_LABELS: Record<SubscriptionTier, string> = {
  free_trial: 'Free Trial',
  starter: 'Builder',
}
```

Also in PaymentModal, the `getPaymentQuote` call will now pass `free_trial` — this is handled by the backend below.

#### 4. `packages/clawdrop-platform/src/services/payment-verifier.ts` — line 35-37

```typescript
// CURRENT:
const TIER_PRICES_USD: Record<string, number> = {
  starter: 19,
  pro: 59,
}

// CHANGE TO:
const TIER_PRICES_USD: Record<string, number> = {
  free_trial: 0.10,
  starter: 29,
}
```

#### 5. `packages/clawdrop-platform/src/routes/payments.ts` — line ~148 (quote endpoint schema)

```typescript
// CURRENT:
const schema = z.object({ tier: z.enum(['starter', 'pro']) });
const parse = schema.safeParse({ tier: _req.query.tier });
if (!parse.success) {
  return res.status(400).json({ error: 'Invalid tier', valid: ['starter', 'pro'] });
}

// CHANGE TO:
const schema = z.object({ tier: z.enum(['free_trial', 'starter']) });
const parse = schema.safeParse({ tier: _req.query.tier });
if (!parse.success) {
  return res.status(400).json({ error: 'Invalid tier', valid: ['free_trial', 'starter'] });
}
```

#### 6. `packages/clawdrop-platform/src/routes/agents.ts` — quick-deploy schema (search for `tier: z.enum`)

```typescript
// CURRENT (somewhere around line 290-310):
tier: z.enum(['starter', 'pro']),

// CHANGE TO:
tier: z.enum(['free_trial', 'starter']),
```

Also in the subscription creation inside quick-deploy (search for `tier` INSERT statement), the `free_trial` period_end should be 7 days, not 30:

```typescript
// After verifyPayment succeeds, find the subscription INSERT and add:
const daysForTier = tier === 'free_trial' ? 7 : 30;
const periodEnd = new Date(Date.now() + daysForTier * 86400000).toISOString();
```

---

### Build & Deploy

```bash
# 1. Type check
cd packages/clawdrop-platform && npx tsc --noEmit
cd packages/trial-frontend && npx tsc --noEmit

# 2. Commit
git add packages/trial-frontend/src/types/api.ts \
        packages/trial-frontend/src/pages/Deploy.tsx \
        packages/trial-frontend/src/components/PaymentModal.tsx \
        packages/clawdrop-platform/src/services/payment-verifier.ts \
        packages/clawdrop-platform/src/routes/payments.ts \
        packages/clawdrop-platform/src/routes/agents.ts
git commit -m "feat(wizard): add free_trial tier ($0.10 SOL) + update starter to $29/mo"
git push

# 3. Deploy on VPS (as root@72.62.239.63, using ~/.ssh/id_rsa)
ssh -i ~/.ssh/id_rsa root@72.62.239.63
cd /opt/hfsp-labs-colosseum
git pull
docker-compose -f docker-compose.trial.yml build clawdrop-platform trial-frontend
docker-compose -f docker-compose.trial.yml up -d clawdrop-platform trial-frontend
```

---

### Verification

```bash
# Free trial quote returns $0.10
curl 'http://localhost:8788/api/payments/quote?tier=free_trial'

# Starter quote returns $29
curl 'http://localhost:8788/api/payments/quote?tier=starter'

# Old tiers rejected
curl 'http://localhost:8788/api/payments/quote?tier=pro'
# → 400 Invalid tier
```

---

**Branch**: `main` (commit directly)  
**Priority**: High — needed for launch  
**Questions**: None — design is clear above
