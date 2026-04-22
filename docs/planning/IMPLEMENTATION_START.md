# HFSP Agent Provisioning - Implementation Start Guide

**Status:** 🚀 Ready to Build  
**Date:** April 3, 2026  
**Focus:** Start with ClawDrop Wizard + Multi-Auth Backend  

---

## 🎯 Project Goal (Updated)

```
USER FLOW:
┌──────────────────┐
│  User visits:    │
│  /wizard         │
└────────┬─────────┘
         │
    ┌────▼──────────────────┐
    │  Choose signup:        │
    │  [Email] [Phantom]     │
    └────┬─────────┬─────────┘
         │         │
    ┌────▼──┐  ┌───▼──────────┐
    │ Email │  │ Phantom      │
    │ Trial │  │ Wallet Trial │
    └────┬──┘  └───┬──────────┘
         └────┬────┘
              │
      ┌───────▼────────┐
      │ Setup Wizard:   │
      │ 1. Agent name   │
      │ 2. Choose model │
      │ 3. Deploy!      │
      └───────┬────────┘
              │
      ┌───────▼─────────────────┐
      │ Backend Provisions:      │
      │ • SSH key generation     │
      │ • VPS allocation         │
      │ • Docker container start │
      │ • Real-time WebSocket    │
      └───────┬─────────────────┘
              │
      ┌───────▼──────────────────┐
      │ Agent Running:            │
      │ • Ready for interaction   │
      │ • 14-day free trial       │
      │ • Can create 1 agent      │
      └──────────────────────────┘
```

**Key Points:**
- ✅ User signs up (Email OR Phantom wallet)
- ✅ Automatic 14-day free trial activated
- ✅ Deploy Docker OpenClaw runtime
- ✅ Agent lives on hfsp-agent-provisioning VPS
- ✅ Uses same backend as Telegram app

---

## 📦 Repo Structure (Monorepo)

```
hfsp-agent-provisioning/          ← Main repo (add to this)
│
├── services/
│   ├── webapp/                    ← Telegram Web App (existing)
│   │   ├── src/
│   │   ├── public/
│   │   └── package.json
│   │
│   ├── storefront-bot/            ← API Server (existing)
│   │   ├── src/
│   │   │   ├── index.ts           ← Main Express app
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts        ← MODIFY: Add email/phantom auth
│   │   │   │   ├── agents.ts      ← Existing
│   │   │   │   └── billing.ts     ← NEW: Stripe integration
│   │   │   ├── provisioner.ts     ← Existing
│   │   │   └── database.ts
│   │   └── package.json
│   │
│   ├── clawdrop-wizard/           ← NEW: Standalone wizard
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── SignupForm.tsx
│   │   │   │   ├── PhantomConnect.tsx
│   │   │   │   ├── SetupWizard.tsx
│   │   │   │   └── ProvisioningStatus.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── usePhantomWallet.ts
│   │   │   │   ├── useAuth.ts
│   │   │   │   └── useProvisioning.ts
│   │   │   ├── pages/
│   │   │   │   ├── SignupPage.tsx
│   │   │   │   ├── WizardPage.tsx
│   │   │   │   └── DashboardPage.tsx
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── public/
│   │   │   └── index.html
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   └── shared/                    ← NEW: Shared code
│       ├── types/
│       │   ├── user.ts
│       │   ├── agent.ts
│       │   └── api.ts
│       ├── validators/
│       │   ├── email.ts
│       │   ├── wallet.ts
│       │   └── agent.ts
│       └── package.json
│
├── tenant-runtime-image/          ← Docker OpenClaw image (existing)
│
├── spec-kit/                      ← All specifications (NEW)
│   ├── 00-INDEX.md
│   ├── 01-ARCHITECTURE.md
│   ├── 02-FRONTEND_SPECS.md
│   ├── 03-BACKEND_SPECS.md
│   ├── 04-DATABASE_SCHEMA.md
│   ├── 05-INTEGRATION_DEPLOYMENT.md
│   ├── 06-WIZARD_PAYWALL_ARCHITECTURE.md
│   └── README.md
│
├── docker-compose.yml             ← Local dev (NEW)
├── package.json                   ← Root monorepo (NEW)
├── tsconfig.json                  ← Root config
├── IMPLEMENTATION_START.md         ← This file
└── README.md

```

---

## 🔧 Implementation Phases

### Phase 1: Backend Foundation (Week 1)
**Priority: CRITICAL - Do this first**

**What to build:**
1. Update database schema (add email/phantom auth fields)
2. Email signup endpoint: `POST /api/v1/auth/email-signup`
3. Phantom signup endpoint: `POST /api/v1/auth/phantom-signup`
4. Email verification logic
5. Phantom signature verification (nacl)
6. Trial system (automatic 14-day free trial)
7. Quota enforcement (max 1 agent for trial users)

**Files to modify/create:**
```
services/storefront-bot/src/
├── routes/auth.ts              ← MODIFY
├── routes/billing.ts           ← NEW
├── database.ts                 ← MODIFY (add schema)
├── middleware/
│   └── authenticate.ts         ← MODIFY (support multiple auth types)
└── utils/
    ├── phantom-verify.ts       ← NEW
    └── email-verify.ts         ← NEW
```

**Dependencies to add:**
```json
{
  "nacl": "^1.2.0",           // Phantom signature verification
  "nodemailer": "^6.9.0",     // Email sending
  "stripe": "^12.0.0",        // Payment processing
  "bcrypt": "^5.1.0"          // Password hashing
}
```

### Phase 2: ClawDrop Wizard Frontend (Week 2)
**Depends on Phase 1 being complete**

**What to build:**
1. `services/clawdrop-wizard/` (new React app with Vite)
2. SignupForm component (email OR Phantom)
3. PhantomConnect component (wallet integration)
4. SetupWizard component (create first agent)
5. ProvisioningStatus component (real-time updates)
6. Dashboard (view agents, trial status)

**Structure:**
```
services/clawdrop-wizard/
├── src/
│   ├── pages/
│   │   ├── SignupPage.tsx       ← Email or Phantom?
│   │   ├── WizardPage.tsx       ← Create agent
│   │   └── DashboardPage.tsx    ← View agents
│   ├── components/
│   │   ├── SignupForm.tsx       ← Email form
│   │   ├── PhantomConnect.tsx   ← Wallet button
│   │   ├── SetupForm.tsx        ← Agent creation
│   │   └── shared/
│   ├── hooks/
│   │   ├── usePhantomWallet.ts
│   │   ├── useAuth.ts
│   │   └── useProvisioning.ts
│   └── App.tsx
└── public/index.html
```

**Key Features:**
- Email signup with verification
- Phantom wallet connection (sign message to verify)
- Automatic trial activation
- Single agent creation form
- Real-time provisioning status
- Trial countdown timer

### Phase 3: Paywall & Billing (Week 3)
**Depends on Phase 1 & 2 being complete**

**What to build:**
1. Stripe integration
2. Upgrade to Pro flow
3. Trial expiration cron job
4. Billing page in dashboard
5. Subscription management

**Endpoints:**
```
POST /api/v1/billing/create-checkout-session
POST /api/v1/billing/upgrade-to-pro
GET /api/v1/billing/subscription-status
POST /api/v1/billing/cancel-subscription
```

### Phase 4: Testing & Launch (Week 4)
**All phases complete**

**Testing:**
- Email signup & verification
- Phantom wallet connection & signature
- Trial system (automatic expiration)
- Quota enforcement (max 1 agent)
- Provisioning pipeline (end-to-end)
- Stripe payment flow
- Real-time WebSocket updates

---

## 🎬 Getting Started (Today)

### Step 1: Create ClawDrop Wizard Project Structure

```bash
cd hfsp-agent-provisioning/services

# Create wizard app with Vite
npm create vite@latest clawdrop-wizard -- --template react-ts
cd clawdrop-wizard

# Install dependencies
npm install
npm install react-router-dom axios zod react-hook-form tailwindcss

# Update vite.config.ts for API proxy
# (proxy API calls to localhost:3000 in dev)
```

### Step 2: Update Backend Auth Routes

```typescript
// services/storefront-bot/src/routes/auth.ts

// Add these endpoints:
app.post('/api/v1/auth/email-signup', handleEmailSignup);
app.post('/api/v1/auth/email-verify', verifyEmailCode);
app.post('/api/v1/auth/phantom-signup', handlePhantomSignup);
app.post('/api/v1/auth/login', handleEmailLogin);
app.post('/api/v1/auth/refresh', refreshToken);
```

### Step 3: Update Database

```bash
# Run migrations
npm run db:migrate -- --to 6

# (Migration 006 adds:)
# - email, password_hash columns
# - phantom_wallet_address column
# - subscription_tier, trial_expires_at
# - trial_tokens table
```

### Step 4: Create Frontend Pages

**SignupPage.tsx** - Choose auth method:
```
[Sign up with Email] [Connect Phantom Wallet]
```

**WizardPage.tsx** - Create first agent:
```
Agent Name: [input]
Model: [dropdown: Claude / GPT-4 / etc]
[Create Agent]
```

**DashboardPage.tsx** - View status:
```
Trial expires in: 13 days
Agents: 1/1
[Create New Agent] (disabled - trial limit)
```

---

## 📋 Database Schema (Quick Ref)

**Key changes needed:**

```sql
-- Update 'users' table
ALTER TABLE users ADD COLUMN (
  subscription_tier TEXT DEFAULT 'free_trial',
  trial_started_at DATETIME,
  trial_expires_at DATETIME,
  
  email TEXT UNIQUE,
  password_hash TEXT,
  
  phantom_wallet_address TEXT UNIQUE,
  phantom_verified BOOLEAN DEFAULT FALSE
);

-- New table for trial tokens
CREATE TABLE trial_tokens (
  token_id TEXT PRIMARY KEY,
  token_code TEXT UNIQUE,
  status TEXT DEFAULT 'available',
  max_uses INTEGER DEFAULT 1,
  current_uses INTEGER DEFAULT 0,
  used_by TEXT,
  expires_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🔑 Key Implementation Details

### Email Signup Flow
```
1. User enters email
2. System sends verification code (6 digits)
3. User receives email with code
4. User enters code in wizard
5. Code verified server-side
6. User account created
7. Auto-activate 14-day free trial
8. Redirect to agent setup
```

### Phantom Wallet Flow
```
1. User clicks "Connect Wallet"
2. Phantom extension opens
3. User selects account to connect
4. Frontend gets wallet address
5. Frontend asks user to sign message
6. User approves signature in Phantom
7. Frontend sends signature to backend
8. Backend verifies signature with nacl
9. User account created
10. Auto-activate 14-day free trial
11. Redirect to agent setup
```

### Trial System
```
Signup → trial_started_at = NOW
      → trial_expires_at = NOW + 14 days
      → subscription_tier = 'free_trial'
      → max_agents = 1

(Daily cron job):
  If trial_expires_at < TODAY:
    → subscription_tier = 'free'
    → Pause all active agents
    → Send upgrade notification
```

---

## 🚀 Deployment (After Implementation)

### Local Development
```bash
docker-compose up
# Starts:
# - Storefront Bot (port 3000)
# - ClawDrop Wizard (port 5173)
# - SQLite DB (./data/hfsp.db)
```

### Production Options

**Option 1: Monorepo on Vercel (Recommended)**
```
vercel.json:
├── Build command: npm run build:all
├── Output dir: services/clawdrop-wizard/dist
└── Environment: BOT_TOKEN, JWT_SECRET, etc.

Routes:
GET  / → ClawDrop Wizard
GET  /api/* → Storefront Bot
WS   /ws/* → WebSocket server
```

**Option 2: Separate Deployments**
```
ClawDrop Wizard → Vercel/Netlify
Storefront Bot  → Render/Railway
Database        → Shared SQLite in bot
```

---

## ✅ Completion Checklist

### Phase 1: Backend
- [ ] Email signup endpoint working
- [ ] Email verification working
- [ ] Phantom signup endpoint working
- [ ] Phantom signature verification working
- [ ] Trial system automatic
- [ ] Quota enforcement (1 agent max)
- [ ] Database migrations applied
- [ ] All auth endpoints tested with Postman

### Phase 2: Frontend
- [ ] SignupPage built and styled
- [ ] PhantomConnect component working
- [ ] SetupWizard form built
- [ ] ProvisioningStatus component displays real-time updates
- [ ] Dashboard shows trial status
- [ ] Responsive on mobile
- [ ] API calls working (auth, create agent, get status)

### Phase 3: Paywall
- [ ] Stripe account created
- [ ] Upgrade endpoint working
- [ ] Trial expiration cron job running
- [ ] Agents paused when trial expires
- [ ] Upgrade email notifications sent

### Phase 4: Testing
- [ ] Email signup → verify → create agent → deploy
- [ ] Phantom wallet → connect → create agent → deploy
- [ ] Trial expires → agents paused → upgrade prompt
- [ ] Real-time provisioning status visible
- [ ] Error handling & recovery

---

## 💡 Important Notes

1. **Don't build Telegram integration yet** - Focus on web wizard first
2. **Test email verification locally** - Use Mailhog or similar
3. **Phantom extension in dev** - Install from Chrome Web Store
4. **WebSocket connection** - Make sure it works from web app
5. **Trial tokens** - Pre-generate numbered codes for distribution
6. **Security** - Never log API keys, wallet addresses, or passwords
7. **CORS** - Configure properly (localhost:5173 in dev, app.hfsp.cloud in prod)

---

## 📚 Quick Reference Links

- **All Specs:** See `/spec-kit/` directory
- **Architecture:** `spec-kit/01-ARCHITECTURE.md`
- **Frontend:** `spec-kit/02-FRONTEND_SPECS.md`
- **Backend API:** `spec-kit/03-BACKEND_SPECS.md`
- **Database:** `spec-kit/04-DATABASE_SCHEMA.md`
- **Deployment:** `spec-kit/05-INTEGRATION_DEPLOYMENT.md`
- **Auth & Paywall:** `spec-kit/06-WIZARD_PAYWALL_ARCHITECTURE.md`

---

## 🎯 Success Criteria

**Day 1-3 (Phase 1 Complete):**
- Email signup working
- Phantom wallet integration working  
- Trial system functional
- Database migrated

**Day 4-7 (Phase 2 Complete):**
- ClawDrop Wizard UI complete
- Form validation working
- API integration complete
- Provisioning status visible

**Day 8-10 (Phase 3 Complete):**
- Stripe integration working
- Upgrade flow working
- Trial expiration job running

**Day 11-14 (Phase 4 Complete):**
- End-to-end testing passed
- Security audit complete
- Ready for launch

---

**Next Step:** Start Phase 1 - Backend Foundation  
**Estimated Time:** 3 days for Phase 1  
**Then:** Proceed to Phase 2 (Frontend)

Let's build! 🚀
