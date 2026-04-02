# HFSP Agent Provisioning - Wizard, Paywall & Auth Architecture

**Version:** 1.0  
**Status:** Critical for Implementation  
**Date:** April 3, 2026  
**Focus:** Multi-auth system (Telegram + Email/Phantom), Free trials, Paywall  

---

## 1. Repo Structure Recommendation

### ✅ RECOMMENDED: Keep as Monorepo

Add to `hfsp-agent-provisioning` rather than create new repo:

```
hfsp-agent-provisioning/                    (main monorepo)
├── services/
│   ├── webapp/                              (Telegram Web App - existing)
│   ├── storefront-bot/                      (Telegram bot + API - existing)
│   ├── clawdrop-wizard/                     (NEW: Standalone web wizard)
│   └── shared/                              (NEW: Shared utilities)
│       ├── validators/
│       ├── types/
│       └── schemas/
│
├── tenant-runtime-image/                    (Docker OpenClaw - existing)
├── spec-kit/                                (NEW: All specifications)
├── docs/                                    (existing)
├── package.json                             (root monorepo)
├── docker-compose.yml                       (local dev)
└── README.md

```

### Why Monorepo?

| Reason | Benefit |
|--------|---------|
| **Shared Backend** | Both UIs call same API endpoints |
| **Shared Database** | Single source of truth for users + agents |
| **Same Provisioner** | Both trigger same Docker container creation |
| **Deployment** | Single service deployment (Storefront Bot hosts both) |
| **Code Reuse** | Shared validators, types, schemas |
| **Easier Coordination** | Frontend, backend, DevOps in one place |

### Alternative: Separate Repo (Not Recommended)
```
❌ Creates duplicate API clients
❌ Duplicates auth logic
❌ Harder to keep in sync
❌ More deployment complexity
❌ More database schema management
```

**Decision: Use monorepo structure above ✅**

---

## 2. Multi-Auth System (Telegram + Email/Wallet)

### 2.1 Authentication Flows

Currently: **Telegram only**  
Needed: **3 authentication paths**

```
┌─────────────────────────────────────────────────────────────┐
│                    User Entry Points                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Telegram Web App              2. ClawDrop Wizard       │
│     ├─ Existing users                  ├─ Email signup    │
│     └─ (No changes)                    ├─ Phantom wallet   │
│                                        └─ Free trial       │
│                                                             │
└──────────────────┬──────────────────────────────────────────┘
                   │
        ┌──────────▼──────────┐
        │  Unified Backend    │
        │  Auth + API         │
        └─────────────────────┘
                   │
        ┌──────────▼──────────┐
        │   SQLite Database   │
        │  (users table)      │
        └─────────────────────┘
```

### 2.2 User Model (Updated)

```typescript
interface User {
  // Unique identifier
  userId: string;                    // u_<random> or telegram_user_id
  
  // Authentication methods (can have multiple)
  telegramUserId?: number;           // If signed up via Telegram
  email?: string;                    // If signed up via email
  phantomWalletAddress?: string;     // If connected Phantom wallet
  
  // Profile
  firstName?: string;
  lastName?: string;
  username?: string;
  profilePicture?: string;
  
  // Subscription & Trial
  subscriptionTier: 'free_trial' | 'free' | 'pro' | 'enterprise';
  trialExpiresAt?: Date;             // Trial expiration
  trialStartedAt?: Date;
  trialTokenUsed?: string;           // Which free trial token (email OR wallet)
  
  // Usage
  maxAgents: number;                 // 1 for free trial, 10 for paid
  currentAgents: number;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  lastActive?: Date;
  
  // Status
  isActive: boolean;
  isBanned: boolean;
}
```

---

## 3. Free Trial System

### 3.1 Trial Rules

```
Free Trial Policy:
├─ Duration: 14 days from signup
├─ Max agents: 1 agent (can create 1 OpenClaw container)
├─ One trial per: email OR wallet address (not both)
├─ After expiry: User must pay or goes to "free" tier (0 agents)
└─ Upgrade path: Payment → "pro" tier

Example Timeline:
Day 1:  User signs up → Gets free trial
        └─ Max 1 agent, 14 days
Day 8:  User still has 6 days left
Day 15: Trial expires
        ├─ If paid: Upgrade to pro → Can create 10 agents
        ├─ If not paid: Downgraded to "free" (0 agents allowed)
        └─ If not paid & has agent: Agent paused, offer upgrade
```

### 3.2 Database Schema for Trials

```sql
-- Add to 'users' table
ALTER TABLE users ADD COLUMN (
  subscription_tier TEXT DEFAULT 'free',     -- free, free_trial, pro, enterprise
  trial_started_at DATETIME,
  trial_expires_at DATETIME,
  trial_identifier TEXT UNIQUE,              -- email OR wallet address (only one per identifier)
  
  -- Phantom wallet
  phantom_wallet_address TEXT UNIQUE,
  phantom_connected_at DATETIME,
  
  -- Email
  email_verified BOOLEAN DEFAULT FALSE,
  email_verified_at DATETIME,
  
  -- Payment
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  payment_status TEXT,                       -- active, cancelled, expired
  next_billing_date DATETIME
);

-- New table: Trial tokens (pre-generated for distribution)
CREATE TABLE trial_tokens (
  token_id TEXT PRIMARY KEY,                 -- trial_<random>
  token_code TEXT UNIQUE,                    -- human-readable code (e.g., TRIAL2024)
  token_type TEXT,                           -- 'numbered' (limited quantity)
  
  status TEXT DEFAULT 'available',           -- available, used, expired
  max_uses INTEGER DEFAULT 1,
  current_uses INTEGER DEFAULT 0,
  
  validity_duration_days INTEGER DEFAULT 14,
  
  used_by_email TEXT,                        -- First user to redeem
  used_by_wallet TEXT,                       -- OR wallet
  used_at DATETIME,
  
  expires_at DATETIME,                       -- Token expires if not used
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Track who used which trial
CREATE TABLE trial_usage (
  usage_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  token_id TEXT,
  trial_started_at DATETIME,
  trial_expires_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (token_id) REFERENCES trial_tokens(token_id)
);
```

### 3.3 Trial Signup Flow

**Via ClawDrop Wizard:**

```
┌─────────────────────────────────────┐
│  1. User visits /wizard             │
└──────────────┬──────────────────────┘
               │
        ┌──────▼──────────────────────┐
        │  2. Choose signup method    │
        │                             │
        │  [Email]  [Phantom Wallet]  │
        └──────────┬─────────┬────────┘
                   │         │
          ┌────────▼──┐  ┌───▼─────────────┐
          │ Email     │  │ Phantom Wallet  │
          │ =========│  │ ================│
          │           │  │                 │
          │ 1. Type   │  │ 1. Install ext  │
          │    email  │  │    (if needed)  │
          │           │  │                 │
          │ 2. Verify │  │ 2. Click        │
          │    code   │  │    "Connect"    │
          │           │  │                 │
          │ 3. Accept │  │ 3. Approve in   │
          │    trial  │  │    Phantom      │
          │           │  │                 │
          │ 4. Create │  │ 4. Verify       │
          │    acct   │  │    ownership    │
          │           │  │ (sign message)  │
          │           │  │                 │
          │ 5. Trial  │  │ 5. Trial        │
          │    active │  │    active       │
          └────────┬──┘  └───┬─────────────┘
                   │         │
        ┌──────────▴─────────▴────────────┐
        │ 3. Redirect to Setup Wizard     │
        │                                 │
        │ [Create Your First Agent]       │
        │ - Agent name                    │
        │ - Choose model                  │
        │ - Deploy                        │
        └─────────────────────────────────┘
```

---

## 4. Phantom Wallet Integration

### 4.1 Phantom Authentication

**Step 1: Check Wallet Connection**

```typescript
// services/clawdrop-wizard/src/hooks/usePhantomWallet.ts

export function usePhantomWallet() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if Phantom extension is installed
  const getProvider = () => {
    if ('solana' in window && (window as any).solana?.isPhantom) {
      return (window as any).solana;
    }
    throw new Error('Phantom wallet not found. Install extension or use email signup.');
  };

  const connectWallet = async () => {
    try {
      const provider = getProvider();
      const response = await provider.connect();
      const address = response.publicKey.toString();
      setWalletAddress(address);
      setIsConnected(true);
      return address;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const signMessage = async (message: string) => {
    const provider = getProvider();
    const encoded = new TextEncoder().encode(message);
    const signed = await provider.signMessage(encoded);
    return signed.signature;
  };

  return { walletAddress, isConnected, connectWallet, signMessage, error };
}
```

**Step 2: Server-side Verification**

```typescript
// services/storefront-bot/src/routes/auth.ts

import crypto from 'crypto';
import nacl from 'tweetnacl';

POST /api/v1/auth/phantom-signup
{
  walletAddress: "...",
  signedMessage: "<base64>",
  message: "Verify ownership of wallet..."
}

// Verification logic
function verifyPhantomSignature(
  walletAddress: string,
  signedMessage: Buffer,
  originalMessage: string
): boolean {
  try {
    const encoded = new TextEncoder().encode(originalMessage);
    const publicKey = new PublicKey(walletAddress);
    
    // Verify signature was created by this wallet
    const valid = nacl.sign.detached.verify(
      encoded,
      signedMessage,
      publicKey.toBuffer()
    );
    
    return valid;
  } catch (err) {
    return false;
  }
}
```

### 4.2 Wallet Signup Endpoint

```typescript
POST /api/v1/auth/phantom-signup
{
  "walletAddress": "F1Vc6agoxDd6jKbkAC5kk3eYEQVAsset9NxQwQWJZ4s1",
  "signedMessage": "MEQCIA7t...",
  "message": "Sign to verify ownership: Verify ownership of wallet F1Vc6agoxDd6jKbkAC5kk3eYEQVAsset9NxQwQWJZ4s1"
}

// Response: 201 Created
{
  "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "user": {
    "userId": "u_phantom_abc123",
    "walletAddress": "F1Vc6agoxDd6jKbkAC5kk3eYEQVAsset9NxQwQWJZ4s1",
    "subscriptionTier": "free_trial",
    "trialExpiresAt": "2026-04-17T00:00:00Z",
    "maxAgents": 1
  }
}
```

---

## 5. Email Signup with Free Trial

### 5.1 Email Signup Endpoint

```typescript
POST /api/v1/auth/email-signup
{
  "email": "user@example.com",
  "password": "secure_password_hashed",
  "firstName": "John",
  "lastName": "Doe"
}

// Response: 201 Created
{
  "userId": "u_email_abc123",
  "email": "user@example.com",
  "subscriptionTier": "free_trial",
  "trialExpiresAt": "2026-04-17T00:00:00Z",
  "maxAgents": 1,
  "message": "Welcome! Your 14-day free trial is active."
}
```

### 5.2 Email Verification (Optional)

```typescript
// Send verification email with code
POST /api/v1/auth/send-verification-email
{
  "email": "user@example.com"
}

// Verify email
POST /api/v1/auth/verify-email
{
  "email": "user@example.com",
  "code": "123456"  // 6-digit code sent to email
}
```

---

## 6. Paywall Logic

### 6.1 Quota Enforcement

```typescript
// When user tries to create agent (POST /api/v1/agents)

function checkQuota(user: User): void {
  // Check subscription status
  if (user.subscriptionTier === 'free_trial') {
    // Check if trial expired
    if (new Date() > user.trialExpiresAt!) {
      throw new Error(
        `Trial expired on ${user.trialExpiresAt.toISOString()}. 
        Upgrade to Pro to continue creating agents.`
      );
    }
    
    // Check agent count
    if (user.currentAgents >= 1) {  // Max 1 for free trial
      throw new Error(
        `Free trial limited to 1 agent. 
        You already have 1 agent. Upgrade to Pro.`
      );
    }
  }
  
  if (user.subscriptionTier === 'free') {
    throw new Error(
      `Free plan allows 0 agents. 
      Upgrade to Pro to create agents.`
    );
  }
  
  if (user.subscriptionTier === 'pro') {
    if (user.currentAgents >= 10) {  // Max 10 for pro
      throw new Error(
        `Pro plan limited to 10 agents. 
        You have reached the limit. Upgrade to Enterprise.`
      );
    }
  }
  
  // Enterprise: unlimited
  // No additional checks
}
```

### 6.2 Trial Expiration Check (Cron Job)

```typescript
// Run daily at 2 AM
import cron from 'node-cron';

cron.schedule('0 2 * * *', async () => {
  // Find trials that expired today
  const expiredTrials = db.prepare(`
    SELECT u.* FROM users u
    WHERE u.subscription_tier = 'free_trial'
    AND DATE(u.trial_expires_at) = DATE('now')
  `).all();
  
  for (const user of expiredTrials) {
    // 1. Downgrade to free
    db.prepare(`
      UPDATE users 
      SET subscription_tier = 'free'
      WHERE user_id = ?
    `).run(user.userId);
    
    // 2. Pause any active agents
    const agents = db.prepare(`
      SELECT * FROM tenants
      WHERE telegram_user_id = ? AND status = 'active'
    `).all(user.userId);
    
    for (const agent of agents) {
      db.prepare(`
        UPDATE tenants SET status = 'paused'
        WHERE tenant_id = ?
      `).run(agent.tenantId);
      
      // 3. Notify user
      sendNotification(user.email || user.telegramUserId, {
        subject: 'Trial Expired - Upgrade to Continue',
        message: `Your free trial has expired. Upgrade to Pro to continue using your agents.`,
        cta: 'Upgrade Now'
      });
    }
  }
});
```

---

## 7. Payment Integration (Stripe)

### 7.1 Upgrade Flow

```
User clicks "Upgrade to Pro"
    ↓
/api/v1/billing/create-checkout-session
    ├─ Create Stripe checkout session
    ├─ Pass user ID + subscription tier
    └─ Return checkout URL
    ↓
User → Stripe checkout → Pay
    ↓
Stripe webhook: payment_intent.succeeded
    ├─ Update user subscription_tier = 'pro'
    ├─ Update stripe_customer_id
    ├─ Update stripe_subscription_id
    └─ Send confirmation email
    ↓
User redirected to dashboard
    ├─ Status: "Pro plan activated"
    ├─ Max agents: 10
    └─ Can create agents immediately
```

### 7.2 Subscription Management

```typescript
POST /api/v1/billing/create-checkout-session
{
  "planId": "price_prod_1234"  // stripe price ID for "Pro"
}

// Response
{
  "sessionId": "cs_live_...",
  "checkoutUrl": "https://checkout.stripe.com/pay/cs_..."
}

// Webhook handler
POST /webhooks/stripe
event.type = "payment_intent.succeeded"
  └─ Update user subscription in database
```

---

## 8. Updated Database Schema

### Additional Tables/Columns

```sql
-- ALTER users table (add to existing)
ALTER TABLE users ADD COLUMN (
  subscription_tier TEXT DEFAULT 'free' 
    CHECK (subscription_tier IN ('free', 'free_trial', 'pro', 'enterprise')),
  trial_started_at DATETIME,
  trial_expires_at DATETIME,
  
  -- Multi-auth support
  email TEXT UNIQUE,
  email_verified BOOLEAN DEFAULT FALSE,
  password_hash TEXT,  -- Only for email auth
  
  phantom_wallet_address TEXT UNIQUE,
  phantom_verified BOOLEAN DEFAULT FALSE,
  
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT,
  payment_status TEXT,
  next_billing_date DATETIME
);

-- Trial tokens table (for distributing free trials)
CREATE TABLE trial_tokens (
  token_id TEXT PRIMARY KEY,
  token_code TEXT UNIQUE,
  token_type TEXT,              -- 'numbered', 'unlimited'
  max_uses INTEGER DEFAULT 1,
  current_uses INTEGER DEFAULT 0,
  
  validity_days INTEGER DEFAULT 14,
  
  used_by TEXT,                 -- user_id who redeemed
  used_at DATETIME,
  expires_at DATETIME,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 9. Updated Implementation Roadmap

### Phase 1: Foundation (Week 1)
- [x] Database schema
- [x] API endpoints  
- [ ] **Add: Email/Phantom auth endpoints**
- [ ] **Add: Trial system endpoints**

### Phase 2: ClawDrop Wizard (Week 2)
- [ ] Standalone React app
- [ ] Email signup form
- [ ] Phantom wallet integration
- [ ] Trial display
- [ ] Agent setup form

### Phase 3: Paywall (Week 3)
- [ ] Stripe integration
- [ ] Quota enforcement
- [ ] Trial expiration job
- [ ] Upgrade flow

### Phase 4: Testing & Launch (Week 4)
- [ ] Email verification
- [ ] Phantom signature verification
- [ ] Payment flow testing
- [ ] Trial expiration testing

---

## 10. Security Checklist (Updated)

- [ ] Email addresses hashed in logs
- [ ] Passwords never stored plaintext (bcrypt/argon2)
- [ ] Phantom signatures verified server-side (nacl)
- [ ] Trial tokens are random & non-sequential
- [ ] Stripe API keys in environment variables only
- [ ] Webhook signature validation (Stripe)
- [ ] Rate limit email signup (5 per IP per hour)
- [ ] Rate limit trial redemption (1 per email/wallet)

---

## Summary

### Repo Structure: ✅ Keep as Monorepo
```
hfsp-agent-provisioning/
├── services/
│   ├── webapp/              (Telegram Web App)
│   ├── storefront-bot/      (API server)
│   └── clawdrop-wizard/     (NEW: Email/Phantom signup)
└── spec-kit/
```

### Auth System: ✅ Multi-path
```
Telegram  →  Telegram Web App
Email     →  ClawDrop Wizard  →  Dashboard
Phantom   →  ClawDrop Wizard  →  Dashboard
```

### Trial System: ✅ One per email/wallet
```
User signs up (email OR Phantom)
    ↓
Automatic 14-day free trial
    ↓
Max 1 agent during trial
    ↓
Trial expires → Pauses agents → "Upgrade to continue"
```

### Paywall: ✅ After trial
```
Free Trial (14 days, 1 agent) → Expires
    ↓
"Upgrade to Pro" button
    ↓
Stripe checkout
    ↓
Pro plan (10 agents, unlimited time)
```

**Next**: Create updated backend specs with these auth endpoints
