# 🚀 START HERE - 3 Day MVP Launch

**Status:** Ready to execute  
**Timeline:** 72 hours  
**Team:** Backend + Frontend + DevOps  
**Goal:** Working auth + paywall + wizard UI  

---

## ⚡ What Changed (Critical Updates)

Your project clarifications → Updated specs:

✅ **Trial Model:** One trial per EMAIL + WALLET combo (not email OR wallet)  
✅ **Pricing:** NO FREE PLAN → First plan is $9/month Pro  
✅ **Token Model:** Users bring their own LLM API keys (OpenAI, Anthropic, etc)  
✅ **Payment:** SumUp (not Stripe)  
✅ **Scope:** 3 days = Auth + Paywall MVP (mock provisioning)  

---

## 📖 Reading Order (15 minutes)

1. **This file** (2 min) - Overview
2. **CRITICAL_UPDATES.md** (8 min) - What changed  
3. **3DAY_SPRINT.md** (5 min) - Detailed hour-by-hour plan

Then → Start building!

---

## 📋 New Files Created

**You now have 4 files in `/hfsp-agent-provisioning/`:**

```
CRITICAL_UPDATES.md      (502 lines) ← READ THIS FIRST
3DAY_SPRINT.md          (761 lines) ← Detailed sprint plan
START_HERE_3DAY.md      (this file)
+ All previous spec-kit files (still valid)
```

---

## 🎯 3-Day Sprint Summary

### Day 1: Backend (8 hours)
**Owner:** Backend Engineer

What to build:
- ✅ Email signup + verification
- ✅ Phantom wallet integration  
- ✅ Email + wallet combo validation (no duplicate trials)
- ✅ Automatic 14-day trial activation
- ✅ SumUp checkout endpoint ($9/month)
- ✅ SumUp webhook handler
- ✅ Quota enforcement (1 agent trial, 10 agents pro)
- ✅ Database migrations

**Deliverable:** All endpoints working, tested with Postman

### Day 2: Frontend (8 hours)
**Owner:** Frontend Engineer  

What to build:
- ✅ Create `services/clawdrop-wizard/` React app
- ✅ SignupPage (choose email or phantom)
- ✅ EmailSignupForm (with verification code)
- ✅ PhantomSignupForm (connect wallet)
- ✅ SetupWizard (create first agent)
- ✅ DashboardPage (view agents, trial countdown)
- ✅ Upgrade button (links to SumUp)
- ✅ Mobile responsive CSS
- ✅ API integration (call backend)

**Deliverable:** Full user flow working in browser

### Day 3: Integration + Testing (8 hours)
**Owner:** DevOps / Full-stack  

What to test:
- ✅ Email signup → create agent → deploy (mock)
- ✅ Phantom wallet → create agent → deploy
- ✅ Trial expiration → quota enforcement
- ✅ SumUp payment → subscription update
- ✅ Error handling (all edge cases)
- ✅ Mobile responsive on real devices
- ✅ Docker-compose deployment

**Deliverable:** Ready to launch! 🚀

---

## ✅ Pre-Sprint Checklist (Do RIGHT NOW)

**Backend Engineer:**
- [ ] Read CRITICAL_UPDATES.md (focus on database schema)
- [ ] Read 3DAY_SPRINT.md - Day 1 section
- [ ] Have Node.js 18+ installed
- [ ] Have SQLite3 installed
- [ ] Clone/pull latest code
- [ ] Create `.env` file with placeholders

**Frontend Engineer:**
- [ ] Read CRITICAL_UPDATES.md  
- [ ] Read 3DAY_SPRINT.md - Day 2 section
- [ ] Have Node.js 18+ installed
- [ ] Install Phantom wallet extension (Chrome)
- [ ] Clone/pull latest code
- [ ] Familiar with Vite + React 18

**DevOps/Both:**
- [ ] Read 3DAY_SPRINT.md - Day 3 section
- [ ] Have Docker + docker-compose installed
- [ ] SumUp test account created
- [ ] Get SumUp API keys
- [ ] Set up `.env` with all keys
- [ ] Postman installed for API testing

---

## 🚀 How to Start (Next 30 minutes)

### Step 1: Create Directory Structure
```bash
cd /Users/mac/hfsp-agent-provisioning/services

# Create wizard (Frontend will do this, but set up now)
mkdir -p clawdrop-wizard
```

### Step 2: Backend Engineer - Database Migration
```bash
cd /Users/mac/hfsp-agent-provisioning/services/storefront-bot

# Create migration 007
cat > migrations/007-add-auth-sumup.sql << 'SQL'
ALTER TABLE users ADD COLUMN (
  subscription_tier TEXT DEFAULT 'free_trial',
  trial_started_at DATETIME,
  trial_expires_at DATETIME,
  email TEXT UNIQUE,
  password_hash TEXT,
  phantom_wallet_address TEXT UNIQUE,
  sumup_customer_id TEXT,
  payment_status TEXT
);
SQL

# Run migration
npm run db:migrate -- --to 7
```

### Step 3: Frontend Engineer - Create Vite Project
```bash
cd /Users/mac/hfsp-agent-provisioning/services

# Create with Vite
npm create vite@latest clawdrop-wizard -- --template react-ts
cd clawdrop-wizard
npm install
npm run dev
# Should see Vite running on http://localhost:5173
```

### Step 4: DevOps - Docker Compose
```bash
cd /Users/mac/hfsp-agent-provisioning

# Create docker-compose.yml (see 3DAY_SPRINT.md for full file)
cat > docker-compose.yml << 'YAML'
version: '3.8'
services:
  bot:
    build: ./services/storefront-bot
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: development
YAML
```

---

## 📊 Success Metrics

### By EOD Day 1:
```
Postman tests:
✅ POST /api/v1/auth/email-signup → 201
✅ POST /api/v1/auth/verify-email → 200
✅ POST /api/v1/auth/phantom-signup → 201
✅ POST /api/v1/billing/sumup-checkout → 200
✅ Database has new users table columns
```

### By EOD Day 2:
```
Browser:
✅ http://localhost:5173 loads
✅ Email signup form renders
✅ Phantom connect button works
✅ Agent creation form renders
✅ Mobile responsive on iPhone
```

### By EOD Day 3:
```
Full flow:
✅ Signup email → verify → create agent → success
✅ Connect phantom → create agent → success
✅ Trial countdown shows 14 days
✅ Upgrade button shows SumUp checkout
✅ docker-compose up → everything works
```

---

## 🎯 Critical Don'ts (Save time, ship MVP)

❌ **Don't build:**
- Real Docker provisioning (mock it!)
- VPS SSH setup (do Day 4)
- Advanced error recovery (basic error messages fine)
- Admin dashboard (users only)
- Analytics (v2 feature)
- Email templates (console output is fine for now)
- Complex UX flows (simple forms work)

❌ **Don't wait for:**
- Perfect styling (MVP ugly is fine)
- 100% test coverage (happy path only)
- API documentation (OpenAPI later)
- Performance optimization (works now, optimize later)

---

## 📞 If Stuck

### Can't get SumUp API key?
→ Use mock endpoint that returns `{ checkoutUrl: 'https://demo.sumup.com/...' }`

### Phantom wallet signature failing?
→ Use test data, skip signature verification in dev mode (`process.env.NODE_ENV === 'development'`)

### Database migration failing?
→ Check SQLite version (`sqlite3 --version`), ensure WAL mode enabled

### Email verification failing?
→ Just log code to console in dev, use nodemailer for real email setup later

### Can't get Vite to build?
→ Check Node version (`node --version` should be 18+), clear node_modules, reinstall

---

## 🎬 Sprint Kickoff (Right Now)

**Announce to team:**

> We're building the MVP in 3 days:
> - Day 1: Backend (auth + paywall)
> - Day 2: Frontend (wizard UI)  
> - Day 3: Integration + testing
>
> Goal: Users can signup (email or Phantom) → create agent → upgrade to $9/month
>
> Read CRITICAL_UPDATES.md + 3DAY_SPRINT.md
>
> Start NOW ✅

---

## 📚 Reference Guides (If You Need More Detail)

- **CRITICAL_UPDATES.md** - What changed from original specs
- **3DAY_SPRINT.md** - Hour-by-hour breakdown
- **spec-kit/06-WIZARD_PAYWALL_ARCHITECTURE.md** - Full auth + paywall design
- **spec-kit/03-BACKEND_SPECS.md** - API endpoint specs
- **spec-kit/02-FRONTEND_SPECS.md** - React component specs

---

## ✨ The Dream

In 72 hours:
- Users visit /wizard
- Sign up with email OR phantom wallet
- Get automatic 14-day trial (1 agent max)
- Create agent (mock deploys in 5 sec)
- See trial countdown on dashboard
- Click "Upgrade" → SumUp checkout → Pay $9
- Boom! Now can create 10 agents

Then Week 2: Real Docker provisioning, VPS setup, etc.

---

## 🎉 You're Ready!

Everything is set up. All you need to do is:

1. **Read:** CRITICAL_UPDATES.md (8 min)
2. **Read:** 3DAY_SPRINT.md (10 min)
3. **Assign:** Backend + Frontend engineers
4. **Get:** SumUp API keys
5. **Start:** Hour 1 (backend database migration)

**Timeline:** NOW → 72 hours → LIVE 🚀

---

**Questions?** Check 3DAY_SPRINT.md - it has all the details!

**Ready to ship?** Let's go! 💪
