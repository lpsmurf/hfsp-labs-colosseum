# ⚠️ Critical Updates to Specification

**Date:** April 3, 2026  
**Updates:** Trial system, payment model, token approach  
**Impact:** Affects backend auth + paywall logic

---

## 🔄 Model Clarifications

### 1. Trial System (UPDATED)

**Old Model:**
```
Free trial → Free plan → Pro plan ($29/month)
```

**NEW Model:**
```
Free trial (14 days) → $9/month Pro plan (only paid plan)
NO FREE PLAN
```

**Trial Rules (Updated):**
- Duration: 14 days
- Max agents: 1 agent
- **One trial per: EMAIL + WALLET COMBINATION**
  - User can't signup with same email + different wallet
  - User can't signup with different email + same wallet
- After expiry: User must pay $9/month or agents pause
- No downgrade to free tier (there is no free plan)

### 2. API Token Model (CRITICAL CHANGE)

**Users bring their own LLM API tokens!**

```
User provides:
├─ OpenAI API key (they pay OpenAI)
├─ Anthropic API key (they pay Anthropic)  
├─ Or other provider key
└─ HFSP charges: $9/month for provisioning/hosting

Cost breakdown (user perspective):
├─ LLM tokens: Pay directly to OpenAI/Anthropic
└─ Provisioning: $9/month to HFSP
```

**Impact on implementation:**
- ✅ Simpler paywall (no token metering)
- ✅ No usage tracking per token
- ✅ Fixed $9/month pricing (flat rate)
- ❌ User responsible for their LLM costs
- ❌ HFSP not responsible if user's API key is invalid/exhausted

### 3. Payment Processor (UPDATED)

**OLD:** Stripe  
**NEW:** SumUp

---

## ✅ Updated Trial Database Schema

```sql
-- Updated users table
ALTER TABLE users ADD COLUMN (
  subscription_tier TEXT DEFAULT 'free_trial'
    CHECK (subscription_tier IN ('free_trial', 'pro')),  -- Only 2 tiers
  
  -- Trial tracking
  trial_started_at DATETIME,
  trial_expires_at DATETIME,
  trial_email_wallet_combo TEXT UNIQUE,        -- email_wallet_address (one per combo)
  
  -- Email auth
  email TEXT UNIQUE,
  email_verified BOOLEAN DEFAULT FALSE,
  password_hash TEXT,
  
  -- Wallet auth  
  phantom_wallet_address TEXT UNIQUE,
  phantom_verified BOOLEAN DEFAULT FALSE,
  
  -- Payment (SumUp)
  sumup_customer_id TEXT UNIQUE,
  sumup_checkout_reference TEXT,
  payment_status TEXT,                         -- active, cancelled, expired
  next_billing_date DATETIME
);

-- Trial tokens (if using pre-generated codes)
CREATE TABLE trial_tokens (
  token_id TEXT PRIMARY KEY,
  token_code TEXT UNIQUE,
  status TEXT DEFAULT 'available',
  max_uses INTEGER DEFAULT 1,
  current_uses INTEGER DEFAULT 0,
  
  -- Tie to email+wallet combo
  used_by_email TEXT,
  used_by_wallet TEXT,
  used_at DATETIME,
  
  expires_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  -- Composite unique: email + wallet
  UNIQUE(used_by_email, used_by_wallet)
);
```

---

## 🚀 SumUp Integration (vs Stripe)

### SumUp Setup
```
1. Create SumUp account
2. Get API key & merchant ID
3. Use SumUp checkout/payment links
4. Handle webhooks for payment confirmation
5. Store sumup_checkout_reference in database
```

### Key Endpoints

```typescript
// Create SumUp payment session (for upgrade to Pro)
POST /api/v1/billing/sumup-checkout-session
{
  "amount": 9.00,      // $9/month
  "currency": "USD",
  "description": "HFSP Pro Monthly"
}

// Verify payment via webhook
POST /webhooks/sumup
event: payment.completed
  → Update user subscription_tier = 'pro'
```

---

## 📊 Simplified Paywall Logic

```typescript
// Quota enforcement (much simpler now)
function checkQuota(user: User): void {
  
  if (user.subscriptionTier === 'free_trial') {
    // Check if trial expired
    if (new Date() > user.trialExpiresAt!) {
      throw new Error(
        `Trial expired. Upgrade to Pro ($9/month) to continue.`
      );
    }
    
    // Check agent count: max 1
    if (user.currentAgents >= 1) {
      throw new Error(
        `Trial limited to 1 agent. Upgrade to Pro (10 agents).`
      );
    }
  }
  
  if (user.subscriptionTier === 'pro') {
    // Check agent count: max 10
    if (user.currentAgents >= 10) {
      throw new Error(
        `Pro plan limited to 10 agents. Contact support for Enterprise.`
      );
    }
  }
  
  // No other tiers exist
}
```

---

## 📋 Implementation Changes (3-Day Plan)

### Day 1: Backend Foundation
Priority: Auth + Database + SumUp setup

**Don't build:**
- ❌ Free plan tier
- ❌ Multiple pricing tiers
- ❌ Usage metering
- ❌ Token counting

**Do build:**
- ✅ Email signup (with email+wallet combo validation)
- ✅ Phantom wallet signup (with email+wallet combo validation)
- ✅ Automatic 14-day trial
- ✅ Trial expiration (pause agents at expiry)
- ✅ SumUp checkout endpoint ($9/month)
- ✅ SumUp webhook handler
- ✅ Quota enforcement (1 agent trial, 10 agents pro)

**Database:**
- ✅ Add email, phantom_wallet, trial_expires_at columns
- ✅ Create trial_tokens table (if using codes)
- ✅ Add sumup_customer_id, payment_status

### Day 2: Frontend (ClawDrop Wizard)
Priority: Signup → Setup → Deploy

**Pages:**
- ✅ SignupPage (email OR phantom)
- ✅ SetupWizard (create agent)
- ✅ ProvisioningStatus (WebSocket real-time)
- ✅ DashboardPage (view agents)
- ✅ Trial countdown (days remaining)
- ✅ Upgrade button (if trial expired)

**No need for:**
- ❌ Multiple pricing tiers display
- ❌ Plan comparison table
- ❌ Usage meter
- ❌ Token counting UI

### Day 3: Polish + Testing
Priority: End-to-end flow + error handling

**Test:**
- ✅ Email signup → deploy agent (Day 1 → Day 2 integration)
- ✅ Phantom wallet → deploy agent
- ✅ Email + wallet combo (prevent duplicate trials)
- ✅ Trial expiration → agents pause
- ✅ Upgrade to Pro → agents unpause
- ✅ SumUp payment flow
- ✅ WebSocket real-time updates

---

## ⚡ 3-Day Timeline Assessment

### Is 3 days realistic?

**YES, but:**

**✅ Achievable if:**
1. Backend & frontend built in parallel (your team setup)
2. You focus ONLY on MVP (no nice-to-haves)
3. SumUp setup done today
4. Team coordinates well (Claude Code + ChatGPT + KimiCode + Gemini)
5. Skip advanced features (custom plans, analytics, etc)
6. Use mock VPS provisioning (don't worry about real Docker setup yet)

**⚠️ Tight if:**
1. SumUp account takes time to setup
2. Email verification infrastructure needed
3. Team not coordinated
4. Real Docker provisioning required

**❌ Not achievable if:**
1. Full security audit required
2. Load testing required
3. Production deployment required
4. Mobile app also needed
5. Telegram integration also required

---

## 🎯 Realistic 3-Day Scope

### What CAN be done in 3 days:
```
Day 1 (8 hours):
├─ Email signup endpoint ✅
├─ Phantom wallet signup ✅
├─ Email verification (basic) ✅
├─ Trial system (auto 14-day) ✅
├─ SumUp integration stub ✅
└─ Database migrations ✅

Day 2 (8 hours):
├─ SignupPage component ✅
├─ SetupWizard form ✅
├─ ProvisioningStatus (WebSocket) ✅
├─ Dashboard (view agents) ✅
├─ API integration ✅
└─ Mobile responsive ✅

Day 3 (8 hours):
├─ Bug fixes ✅
├─ Error handling ✅
├─ End-to-end testing ✅
├─ SumUp webhook handler ✅
└─ Deployment setup ✅
```

### What can't be done in 3 days:
```
❌ Real Docker provisioning (complex SSH setup)
❌ VPS node health monitoring
❌ Advanced error recovery
❌ Load testing
❌ Security audit
❌ Production deployment
❌ Telegram integration
```

---

## 🚀 Recommended 3-Day Plan

### Phase 1A: Backend Only (48 hours)
```
Instead of full end-to-end, focus on:
1. Email signup + verification ✅
2. Phantom wallet connection ✅
3. Database schema ✅
4. SumUp payment endpoint ✅
5. Trial system ✅
6. Quota enforcement ✅
7. API endpoints working (tested with Postman)

Skip:
❌ Real Docker provisioning
❌ VPS SSH setup
❌ Full provisioning pipeline

Use mock provisioning:
✅ Create fake agent response
✅ Simulate provisioning status
✅ Return success after 10 seconds
```

### Phase 2: Frontend MVP (24 hours)
```
Use backend from Phase 1A:
1. SignupPage (email + phantom)
2. SetupWizard (single form)
3. Mock ProvisioningStatus (fake WebSocket)
4. DashboardPage
5. Trial countdown
6. Upgrade button → SumUp checkout

All connected to real backend!
```

### Phase 3: Polish (24 hours)
```
1. Error handling
2. Mobile responsive
3. End-to-end testing
4. Bug fixes
5. Deployment config
```

---

## ✅ Updated Task List (3 Days)

### Day 1: Backend (Backend Engineer)
- [ ] Email signup endpoint (POST /api/v1/auth/email-signup)
- [ ] Email verification (POST /api/v1/auth/verify-email)
- [ ] Phantom signup endpoint (POST /api/v1/auth/phantom-signup)
- [ ] Phantom signature verification (NaCl)
- [ ] Email + wallet combo validation (one trial per combo)
- [ ] Trial system (14-day auto-activation)
- [ ] Quota enforcement (1 agent trial, 10 agents pro)
- [ ] SumUp checkout endpoint (POST /api/v1/billing/sumup-checkout)
- [ ] SumUp webhook handler
- [ ] Database migrations
- [ ] Test all endpoints with Postman ✓

### Day 2: Frontend (Frontend Engineer)
- [ ] Create `services/clawdrop-wizard/` with Vite
- [ ] SignupPage (email OR phantom)
- [ ] SetupWizard form (agent creation)
- [ ] Mock ProvisioningStatus (fake WebSocket progress)
- [ ] DashboardPage (view agents + trial countdown)
- [ ] Upgrade button (links to SumUp checkout)
- [ ] Mobile responsive CSS
- [ ] API integration (call backend endpoints)
- [ ] Error handling + toast notifications ✓

### Day 3: Integration & Testing (Both)
- [ ] Email signup → create agent → deploy ✓
- [ ] Phantom wallet → create agent → deploy ✓
- [ ] Trial expiration → agents pause ✓
- [ ] Upgrade to Pro → agents unpause ✓
- [ ] SumUp payment flow (test mode) ✓
- [ ] WebSocket connection (real-time updates) ✓
- [ ] Error scenarios (invalid email, wallet not found) ✓
- [ ] Deployment config (docker-compose.yml)
- [ ] Final testing + bug fixes ✓

---

## 💡 Key Simplifications for 3 Days

1. **Mock Provisioning** - Don't build real Docker yet
   - Return instant "success" after 5 seconds
   - Real provisioning comes after launch

2. **Email Verification** - Simple 6-digit code
   - Send via console in dev (use nodemailer in prod)
   - User enters code → account created
   - Don't worry about complex flows

3. **SumUp Integration** - Checkout link only
   - Redirect to SumUp checkout
   - Webhook updates subscription
   - Don't build full payment dashboard

4. **WebSocket** - Mock progress events
   - Send hardcoded events after delay
   - Real provisioning status comes later

---

## ⚠️ Important: Don't Change Core Specs

These specs are NOT changing:
- ✅ 3-day timeline focuses on auth + paywall MVP
- ✅ Monorepo structure still valid
- ✅ Rest of specs (database, API, deployment) still relevant
- ✅ After 3 days: Real Docker provisioning, VPS setup, etc.

The 3-day version is the **MVP** not the full build.

---

## 🎯 3-Day Success Criteria

### By End of Day 1:
- ✅ Can signup with email
- ✅ Can connect Phantom wallet
- ✅ Can create agent (mock deploy)
- ✅ Trial system active (14 days)
- ✅ All tested with Postman

### By End of Day 2:
- ✅ Full UI workflow (signup → deploy)
- ✅ Real-time status updates (fake data)
- ✅ Dashboard displays agents
- ✅ Upgrade button works
- ✅ Mobile responsive

### By End of Day 3:
- ✅ End-to-end testing passed
- ✅ Error handling working
- ✅ Can deploy via docker-compose
- ✅ Ready for team handoff to real provisioning

---

## 📊 Resource Allocation (3 Days)

**Recommended Team:**
- 1 Backend Engineer (API + SumUp + database)
- 1 Frontend Engineer (React + UI)
- Possible 3rd person: DevOps (deployment + docker-compose)

**Tools:**
- Claude Code (backend + database)
- ChatGPT 5.4 (frontend + UI design)
- KimiCode (integration + testing)
- Gemini (documentation + error handling)

Each AI agent specializes in their strength!

---

## ✅ GO/NO-GO Decision

### 3-Day MVP: YES, achievable ✅

**Conditions:**
1. ✅ SumUp account setup TODAY
2. ✅ Skip real Docker provisioning
3. ✅ Use mock provisioning responses
4. ✅ Team coordinates well
5. ✅ Focus only on core auth + paywall flow

**Output:** 
- Working auth system (email + Phantom)
- Working paywall (SumUp)
- Working UI (MVP signup + deploy)
- Ready for real provisioning after

**Then:** Full specs guide remaining 80% of build

---

## Next: Update Implementation Specs?

Do you want me to:
1. ✅ Create 3-DAY_SPRINT.md with exact tasks + PRs
2. ✅ Update 06-WIZARD_PAYWALL_ARCHITECTURE.md with:
   - Single $9/month tier (no free)
   - Email + wallet combo validation
   - SumUp instead of Stripe
   - User-provided LLM tokens model
3. ✅ Create SUMUP_INTEGRATION.md (technical guide)

Shall I do all three?
