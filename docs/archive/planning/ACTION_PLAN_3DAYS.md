# 🎯 FINAL ACTION PLAN - 3-4 Days to Launch

**Status:** Comprehensive reality-based plan  
**Based on:** Existing codebase review  
**Scope:** Add email + Phantom auth + Crypto payment + ClawDrop UI to existing provisioning system

---

## 📊 Current State

### What's Working ✅:
- Real Docker provisioning (ShellProvisioner)
- Telegram Mini App webapp
- Agent wizard flow
- Database with encryption
- Real-time WebSocket updates
- Multi-VPS support ready

### What's Missing ❌:
- Email signup system
- Phantom wallet support
- Crypto payment (Solana)
- ClawDrop web UI (non-Telegram users)
- Trial system + quota enforcement
- API documentation (Swagger)

---

## 🎬 The Plan (3-4 Days)

### DAY 1: Backend Auth System (12 Hours)

**Owner:** Backend Engineer

**Tasks:**
```
Hour 1-2:   Database migration 008
            ADD TO users TABLE:
            - email TEXT UNIQUE
            - password_hash TEXT
            - phantom_wallet_address TEXT UNIQUE
            - subscription_tier TEXT DEFAULT 'free_trial'
            - trial_started_at DATETIME
            - trial_expires_at DATETIME
            
            CREATE crypto_payments TABLE

Hour 2-4:   Email signup system
            POST /api/v1/auth/email-signup
            - Hash password (bcrypt)
            - Send verification code (6-digit)
            - Store user with pending status
            
            POST /api/v1/auth/verify-email
            - Verify code matches
            - Activate account + trial

Hour 4-7:   Phantom wallet system
            POST /api/v1/auth/phantom-signup
            - Verify signature with nacl
            - Create account + activate trial
            - Email + wallet combo validation

Hour 7-9:   Solana payment
            POST /api/v1/billing/upgrade-to-pro
            - Return: walletAddress, amountUsdc, qrCode
            
            POST /api/v1/billing/verify-payment
            - Manual verification (later: auto via blockchain)

Hour 9-10:  Quota + trial logic
            - Check trial expired → pause agents
            - Check quota (1 agent trial, 10 agents pro)
            - Implement in agent creation endpoint

Hour 10-12: Testing
            - Test all 5 endpoints with Postman
            - Verify database changes
            - Verify encryption still works
```

**Deliverable:** All endpoints working, database updated, no Telegram app changes

---

### DAY 2: ClawDrop Web UI (12 Hours)

**Owner:** Frontend Engineer

**Tasks:**
```
Hour 1-2:   Project setup
            npm create vite@latest services/clawdrop-wizard -- --template react-ts
            npm install react-router-dom axios zod react-hook-form tailwindcss
            
            Create folder structure:
            src/pages/
            src/components/
            src/hooks/
            src/services/

Hour 2-4:   Signup pages (new!)
            SignupPage.tsx
            ├─ EmailSignupForm.tsx
            └─ PhantomSignupForm.tsx
            
            Features:
            - Email: form with verification code
            - Phantom: button + instructions

Hour 4-7:   Dashboard pages (new!)
            DashboardHome.tsx (overview)
            AgentsList.tsx (list)
            CreateAgent.tsx (form)
            AgentDetail.tsx (single agent)
            Account.tsx (subscription + settings)
            
            Features:
            - Real-time agent list
            - Create agent with real provisioning
            - View agent details
            - Account info + trial countdown

Hour 7-9:   Upgrade modal (new!)
            UpgradeModal.tsx
            - Show Solana Pay QR code
            - Show wallet address + amount
            - Instructions for user
            - Payment status check

Hour 9-10:  Styling + mobile responsive
            - TailwindCSS theming
            - Mobile-first design
            - Responsive navigation

Hour 10-12: API integration
            - Test all pages connected to backend
            - Error handling
            - Loading states
```

**Deliverable:** Full signup → dashboard → upgrade flow working

---

### DAY 3: Integration + Testing (12 Hours)

**Owner:** DevOps/Full-stack (+ Backend for debugging)

**Tasks:**
```
Hour 1-3:   Email signup flow (end-to-end)
            1. Signup with email
            2. Verify code from email
            3. Auto-activate trial (14 days)
            4. Create first agent
            5. Watch real provisioning
            6. Agent appears in dashboard
            7. Dashboard shows trial countdown

Hour 3-5:   Phantom wallet flow (end-to-end)
            1. Click "Connect Phantom"
            2. Phantom extension opens
            3. Sign message to verify
            4. Auto-activate trial
            5. Create agent (mock for speed)
            6. Real provisioning (if VPS ready)
            7. Dashboard shows trial countdown

Hour 5-7:   Payment flow (Solana)
            1. Trial expires (manually set in DB)
            2. Click "Upgrade to Pro"
            3. Show QR code + wallet address
            4. Scan QR in Phantom
            5. Send USDC payment
            6. Verify payment received
            7. Subscription tier → 'pro'
            8. Can now create 10 agents

Hour 7-9:   Edge cases + error handling
            - Invalid credentials
            - Duplicate email signup
            - Wallet already used
            - Provisioning failure
            - Network errors
            - Quota exceeded

Hour 9-10:  Docker-compose setup
            docker-compose.yml with:
            - Storefront bot (API)
            - ClawDrop wizard (web UI)
            - SQLite database
            
            Test: docker-compose up
            - API at http://localhost:3000
            - UI at http://localhost:5173

Hour 10-12: Final testing + deployment prep
            - All flows tested end-to-end
            - Mobile responsive verified
            - Error messages clear
            - docker-compose working
            - Ready to deploy!
```

**Deliverable:** Production-ready system, ready to launch

---

## 📋 Exact Code to Write

### Backend (Day 1)

**File: services/storefront-bot/src/routes/auth-new.ts** (NEW)

```typescript
// Email signup
app.post('/api/v1/auth/email-signup', async (req, res) => {
  const { email, password, firstName } = req.body;
  
  // Validate
  if (!email.includes('@')) return res.status(400).json({ error: 'Invalid email' });
  if (password.length < 8) return res.status(400).json({ error: 'Password too short' });
  
  // Check duplicate
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (existing) return res.status(400).json({ error: 'Email already registered' });
  
  // Hash password
  const passwordHash = await bcrypt.hash(password, 10);
  
  // Create user + activate trial
  const userId = generateId('u');
  const trialExpiresAt = new Date();
  trialExpiresAt.setDate(trialExpiresAt.getDate() + 14);
  
  db.prepare(`
    INSERT INTO users (
      user_id, email, password_hash, subscription_tier,
      trial_started_at, trial_expires_at, first_name
    ) VALUES (?, ?, ?, 'free_trial', ?, ?, ?)
  `).run(userId, email, passwordHash, new Date(), trialExpiresAt, firstName);
  
  // Send verification code
  const code = Math.random().toString().slice(2, 8);
  sendEmail(email, `Your verification code: ${code}`);
  
  // Return token
  const token = jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '1h' });
  res.status(201).json({
    token,
    user: { userId, email, subscription: 'free_trial', trialExpiresAt },
    message: 'Check your email for verification code'
  });
});

// Email verify
app.post('/api/v1/auth/verify-email', async (req, res) => {
  const { email, code } = req.body;
  // In production: compare code from email
  // For MVP: code sent to console
  res.json({ email_verified: true });
});

// Phantom signup
app.post('/api/v1/auth/phantom-signup', async (req, res) => {
  const { walletAddress, signedMessage, message } = req.body;
  
  // Verify signature
  const encoded = new TextEncoder().encode(message);
  const publicKey = new PublicKey(walletAddress);
  const valid = nacl.sign.detached.verify(
    encoded,
    Buffer.from(signedMessage),
    publicKey.toBuffer()
  );
  
  if (!valid) return res.status(401).json({ error: 'Invalid signature' });
  
  // Check combo (email + wallet)
  const existing = db.prepare(
    'SELECT * FROM users WHERE phantom_wallet_address = ?'
  ).get(walletAddress);
  if (existing) return res.status(400).json({ error: 'Wallet already registered' });
  
  // Create user + activate trial
  const userId = generateId('u');
  const trialExpiresAt = new Date();
  trialExpiresAt.setDate(trialExpiresAt.getDate() + 14);
  
  db.prepare(`
    INSERT INTO users (
      user_id, phantom_wallet_address, subscription_tier,
      trial_started_at, trial_expires_at
    ) VALUES (?, ?, 'free_trial', ?, ?)
  `).run(userId, walletAddress, new Date(), trialExpiresAt);
  
  // Return token
  const token = jwt.sign({ userId, wallet: walletAddress }, JWT_SECRET, { expiresIn: '1h' });
  res.status(201).json({
    token,
    user: { userId, wallet: walletAddress, subscription: 'free_trial', trialExpiresAt },
    message: 'Welcome! Your free trial is active (14 days, 1 agent max)'
  });
});

// Upgrade to Pro (Solana)
app.post('/api/v1/billing/upgrade-to-pro', authenticate, async (req, res) => {
  const userId = req.user.userId;
  const merchantWallet = process.env.SOLANA_WALLET_ADDRESS;
  
  // Generate QR code
  const solanaPayLink = `solana:${merchantWallet}?amount=9&label=HFSP+Pro`;
  const qrCode = await QRCode.toDataURL(solanaPayLink);
  
  // Store in pending
  db.prepare(`
    INSERT INTO crypto_payments (user_id, amount_usdc, status)
    VALUES (?, 9, 'pending')
  `).run(userId);
  
  res.json({
    walletAddress: merchantWallet,
    amountUsdc: 9,
    solanaPayLink,
    qrCode
  });
});
```

### Frontend (Day 2)

**File: services/clawdrop-wizard/src/pages/SignupPage.tsx** (NEW)

```typescript
export const SignupPage: React.FC = () => {
  const [method, setMethod] = useState<'email' | 'phantom' | null>(null);
  
  return (
    <div className="max-w-md mx-auto py-12 px-4">
      {!method ? (
        <>
          <h1 className="text-3xl font-bold mb-6">Sign Up</h1>
          <button
            onClick={() => setMethod('email')}
            className="w-full bg-blue-600 text-white font-bold py-3 rounded mb-4"
          >
            Sign up with Email
          </button>
          <button
            onClick={() => setMethod('phantom')}
            className="w-full bg-purple-600 text-white font-bold py-3 rounded"
          >
            Connect Phantom Wallet
          </button>
        </>
      ) : method === 'email' ? (
        <EmailSignupForm />
      ) : (
        <PhantomSignupForm />
      )}
    </div>
  );
};
```

---

## ✅ Success Checklist

### Day 1 (Backend):
- [ ] Database migration 008 applied
- [ ] Email signup endpoint works (Postman)
- [ ] Email verify endpoint works (Postman)
- [ ] Phantom signup endpoint works (Postman)
- [ ] Solana QR code endpoint works (Postman)
- [ ] Users created with trial (14 days)
- [ ] Trial auto-expires logic works

### Day 2 (Frontend):
- [ ] services/clawdrop-wizard created + runs
- [ ] Signup page renders
- [ ] Email form works
- [ ] Phantom form works
- [ ] Dashboard displays agents
- [ ] Create agent form works
- [ ] Mobile responsive

### Day 3 (Integration):
- [ ] Email signup → agent creation → provisioning ✓
- [ ] Phantom signup → agent creation → provisioning ✓
- [ ] Trial countdown shows correctly
- [ ] Upgrade modal shows QR code
- [ ] Quota enforcement (1 agent trial)
- [ ] docker-compose up → works
- [ ] All tested end-to-end

---

## 🚀 Starting Now

### Minute 1-5: Read This Document

### Minute 5-15: Team Assignment
```
Backend: Start database migration
Frontend: Create services/clawdrop-wizard folder
DevOps: Test VPS SSH + Docker access
```

### Hour 1: Daily Standup
```
Confirm team setup
Identify blockers
Clear start
```

### Hour 2: Begin Day 1 (Backend)
```
Backend: Hour 1-2 (Database)
Frontend: Project setup (Vite)
```

---

## 🎯 Critical Success Factors

1. **Don't modify Telegram app** - leave it alone!
2. **Build ClawDrop parallel** - separate codebase
3. **Use same backend API** - share endpoints
4. **Focus on auth** - that's 80% of the work
5. **Test everything Day 1** - Postman all endpoints
6. **Real provisioning from Day 1** - don't mock!

---

**Ready to ship?** Let's go! 💪

Next: Read REALITY_CHECK.md + then start Hour 1

