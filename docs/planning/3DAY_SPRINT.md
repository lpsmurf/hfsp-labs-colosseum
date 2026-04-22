# ⚡ 3-DAY SPRINT PLAN - MVP Launch

**Timeline:** 72 hours (3 days)  
**Goal:** Working auth + paywall + UI (mock provisioning)  
**Team:** Backend + Frontend + DevOps (3 people)  
**Status:** Ready to execute NOW

---

## 🎯 Sprint Goal

```
By end of Day 3, users can:
1. Sign up with email OR Phantom wallet ✅
2. Get automatic 14-day free trial ✅
3. Create 1 agent (mocked provisioning) ✅
4. See trial countdown ✅
5. Upgrade to Pro ($9/month) via SumUp ✅
```

---

## 📅 DAY 1: Backend Foundation (8 hours)

### Owner: Backend Engineer

### Checklist

#### Hour 0-1: Setup
- [ ] Create database migration 007 (auth fields + SumUp)
```sql
ALTER TABLE users ADD COLUMN (
  subscription_tier TEXT DEFAULT 'free_trial',
  trial_started_at DATETIME,
  trial_expires_at DATETIME,
  email TEXT UNIQUE,
  password_hash TEXT,
  phantom_wallet_address TEXT UNIQUE,
  sumup_customer_id TEXT
);
```

- [ ] Add dependencies to `services/storefront-bot/package.json`:
```bash
npm install bcrypt nodemailer nacl dotenv
```

- [ ] Update `.env`:
```
EMAIL_USER=your@email.com
EMAIL_PASSWORD=app_password
SUMUP_API_KEY=xxx
SUMUP_MERCHANT_ID=xxx
JWT_SECRET=xxx
```

#### Hour 1-3: Email Auth Endpoints
```typescript
// services/storefront-bot/src/routes/auth.ts

// 1. POST /api/v1/auth/email-signup
// Input: { email, password, firstName, lastName }
// Validation: Valid email, password 8+ chars
// Output: { token, user, trialExpiresAt }
// Action: Create user, activate trial, send verification email

// 2. POST /api/v1/auth/verify-email  
// Input: { email, verificationCode }
// Validation: Code matches sent code
// Output: { email_verified: true }
// Action: Mark email verified

// 3. POST /api/v1/auth/login
// Input: { email, password }
// Validation: Correct credentials
// Output: { token, user }
```

**Key validations:**
```typescript
function validateEmailSignup(email: string, password: string) {
  if (!email.includes('@')) throw new Error('Invalid email');
  if (password.length < 8) throw new Error('Password too short');
  
  // Check email+wallet combo not already taken
  const existing = db.prepare(
    'SELECT * FROM users WHERE email = ?'
  ).get(email);
  if (existing) throw new Error('Email already registered');
}
```

#### Hour 3-5: Phantom Wallet Auth
```typescript
// services/storefront-bot/src/routes/auth.ts

// POST /api/v1/auth/phantom-signup
// Input: { walletAddress, signedMessage, message }
// Validation: Verify signature with NaCl
// Output: { token, user, trialExpiresAt }
// Action: Create user, activate trial

function verifyPhantomSignature(
  walletAddress: string,
  signedMessage: Buffer,
  originalMessage: string
): boolean {
  const encoded = new TextEncoder().encode(originalMessage);
  const publicKey = new PublicKey(walletAddress);
  
  return nacl.sign.detached.verify(
    encoded,
    signedMessage,
    publicKey.toBuffer()
  );
}
```

**Key: Email + Wallet Combo Check**
```typescript
// Only allow 1 trial per email+wallet combo
function validateTrialCombo(email: string, walletAddress: string) {
  // If user has trial with this email → reject
  const byEmail = db.prepare(
    'SELECT * FROM users WHERE email = ? AND subscription_tier = "free_trial"'
  ).get(email);
  if (byEmail) throw new Error('Email already has active trial');
  
  // If user has trial with this wallet → reject
  const byWallet = db.prepare(
    'SELECT * FROM users WHERE phantom_wallet_address = ? AND subscription_tier = "free_trial"'
  ).get(walletAddress);
  if (byWallet) throw new Error('Wallet already has active trial');
}
```

#### Hour 5-6: Trial System
```typescript
// services/storefront-bot/src/services/trial.ts

export function activateTrial(userId: string) {
  const trialExpiresAt = new Date();
  trialExpiresAt.setDate(trialExpiresAt.getDate() + 14);
  
  db.prepare(`
    UPDATE users SET
      subscription_tier = 'free_trial',
      trial_started_at = ?,
      trial_expires_at = ?
    WHERE user_id = ?
  `).run(new Date(), trialExpiresAt, userId);
}
```

#### Hour 6-7: SumUp Integration
```typescript
// services/storefront-bot/src/routes/billing.ts

// POST /api/v1/billing/sumup-checkout
// Input: { userId }
// Output: { checkoutUrl }
// Action: Create SumUp checkout session ($9)

import axios from 'axios';

export async function createSumUpCheckout(userId: string): Promise<string> {
  const response = await axios.post(
    'https://api.sumup.com/v0.1/checkouts',
    {
      amount: 900,           // $9 in cents
      currency: 'USD',
      description: 'HFSP Pro Monthly',
      checkout_reference: `user_${userId}_${Date.now()}`,
      return_urls: {
        success_url: `${process.env.FRONTEND_URL}/success`,
        decline_url: `${process.env.FRONTEND_URL}/declined`
      }
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.SUMUP_API_KEY}`
      }
    }
  );
  
  return response.data.checkout_url;
}
```

#### Hour 7-8: SumUp Webhook
```typescript
// services/storefront-bot/src/routes/webhooks.ts

// POST /webhooks/sumup
// Listen for: checkout.completed, payment.completed
// Action: Update user subscription_tier = 'pro'

app.post('/webhooks/sumup', (req, res) => {
  const event = req.body;
  
  if (event.type === 'checkout.completed') {
    const userId = event.body.checkout_reference.split('_')[1];
    
    db.prepare(`
      UPDATE users SET
        subscription_tier = 'pro',
        sumup_customer_id = ?,
        next_billing_date = ?
      WHERE user_id = ?
    `).run(
      event.body.customer_id,
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),  // 30 days
      userId
    );
    
    res.json({ status: 'ok' });
  }
});
```

#### Testing (Hour 8)
```bash
# Test all endpoints with curl/Postman
curl -X POST http://localhost:3000/api/v1/auth/email-signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Verify database entries created
sqlite3 hfsp.db "SELECT * FROM users WHERE email='test@example.com'"
```

---

## 📱 DAY 2: Frontend UI (8 hours)

### Owner: Frontend Engineer

### Checklist

#### Hour 0-1: Project Setup
```bash
cd services

# Create wizard project
npm create vite@latest clawdrop-wizard -- --template react-ts
cd clawdrop-wizard

# Install deps
npm install react-router-dom axios zod react-hook-form tailwindcss

# Create folder structure
mkdir -p src/{pages,components,hooks,services}
```

#### Hour 1-3: SignupPage Component
```tsx
// services/clawdrop-wizard/src/pages/SignupPage.tsx

export const SignupPage: React.FC = () => {
  const [authMethod, setAuthMethod] = useState<'email' | 'phantom' | null>(null);

  return (
    <div className="max-w-md mx-auto py-12">
      {!authMethod ? (
        <>
          <h1 className="text-3xl font-bold mb-6">Create Account</h1>
          <button 
            onClick={() => setAuthMethod('email')}
            className="w-full bg-grid text-bg font-bold py-3 rounded mb-4"
          >
            Sign up with Email
          </button>
          <button
            onClick={() => setAuthMethod('phantom')}
            className="w-full bg-blue text-white font-bold py-3 rounded"
          >
            Connect Phantom Wallet
          </button>
        </>
      ) : authMethod === 'email' ? (
        <EmailSignupForm />
      ) : (
        <PhantomSignupForm />
      )}
    </div>
  );
};
```

#### Hour 3-4: EmailSignupForm
```tsx
// services/clawdrop-wizard/src/components/EmailSignupForm.tsx

export const EmailSignupForm: React.FC = () => {
  const form = useForm({
    resolver: zodResolver(emailSignupSchema)
  });

  const onSubmit = async (data) => {
    // 1. Signup
    const signupRes = await api.post('/auth/email-signup', {
      email: data.email,
      password: data.password,
      firstName: data.firstName
    });
    
    // 2. Verify (send email)
    // (backend sends code to email)
    
    // 3. Verify code
    await api.post('/auth/verify-email', {
      email: data.email,
      verificationCode: data.code
    });
    
    // 4. Store token
    sessionStorage.setItem('jwt', signupRes.data.token);
    
    // 5. Redirect
    navigate('/wizard');
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <Input label="Email" {...form.register('email')} />
      <Input label="Password" type="password" {...form.register('password')} />
      <Input label="Verification Code (check email)" {...form.register('code')} />
      <button type="submit" className="w-full bg-grid text-bg py-2 rounded mt-4">
        Create Account
      </button>
    </form>
  );
};
```

#### Hour 4-5: PhantomSignupForm
```tsx
// services/clawdrop-wizard/src/components/PhantomSignupForm.tsx

export const PhantomSignupForm: React.FC = () => {
  const { walletAddress, connectWallet, signMessage } = usePhantomWallet();
  const [signed, setSigned] = useState(false);

  const handleConnect = async () => {
    const address = await connectWallet();
    
    // Sign message
    const message = `Verify ownership of wallet ${address}`;
    const signature = await signMessage(message);
    
    // Signup
    const res = await api.post('/auth/phantom-signup', {
      walletAddress: address,
      signedMessage: signature,
      message
    });
    
    sessionStorage.setItem('jwt', res.data.token);
    setSigned(true);
  };

  return (
    <div>
      {!walletAddress ? (
        <button onClick={handleConnect} className="w-full bg-blue text-white py-3 rounded">
          Connect Phantom
        </button>
      ) : signed ? (
        <>
          <p className="text-green text-center">✓ Connected!</p>
          <button 
            onClick={() => navigate('/wizard')}
            className="w-full bg-grid text-bg py-3 rounded mt-4"
          >
            Continue to Setup
          </button>
        </>
      ) : (
        <p>Approve signature in Phantom...</p>
      )}
    </div>
  );
};
```

#### Hour 5-6: SetupWizard Component
```tsx
// services/clawdrop-wizard/src/pages/WizardPage.tsx

export const WizardPage: React.FC = () => {
  const [agentName, setAgentName] = useState('');
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState<'idle' | 'provisioning' | 'complete'>('idle');

  const handleCreate = async () => {
    setCreating(true);
    setStatus('provisioning');
    
    // Call backend to create agent
    const res = await api.post('/agents', {
      agentName,
      botToken: 'temp',  // Mock
      botUsername: 'temp_bot',
      template: 'blank',
      provider: 'anthropic'
    });
    
    // Simulate provisioning (5 seconds)
    await new Promise(r => setTimeout(r, 5000));
    setStatus('complete');
  };

  return (
    <div className="max-w-md mx-auto py-12">
      <h1 className="text-3xl font-bold mb-6">Create Your First Agent</h1>
      
      <input
        type="text"
        placeholder="Agent name"
        value={agentName}
        onChange={(e) => setAgentName(e.target.value)}
        className="w-full px-4 py-2 bg-surface border border-border rounded mb-4"
      />
      
      <button
        onClick={handleCreate}
        disabled={creating}
        className="w-full bg-grid text-bg font-bold py-3 rounded"
      >
        {creating ? 'Creating...' : 'Create Agent'}
      </button>
      
      {status === 'provisioning' && (
        <div className="mt-6 text-center">
          <div className="inline-block animate-spin">⏳</div>
          <p className="text-muted mt-2">Provisioning...</p>
        </div>
      )}
      
      {status === 'complete' && (
        <div className="mt-6 text-center text-green">
          ✓ Agent created!
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full bg-grid text-bg py-2 rounded mt-4"
          >
            View Dashboard
          </button>
        </div>
      )}
    </div>
  );
};
```

#### Hour 6-7: DashboardPage
```tsx
// services/clawdrop-wizard/src/pages/DashboardPage.tsx

export const DashboardPage: React.FC = () => {
  const [user, setUser] = useState(null);
  const [agents, setAgents] = useState([]);
  const [trialDaysLeft, setTrialDaysLeft] = useState(0);

  useEffect(() => {
    // Fetch user
    api.get('/auth/me').then(res => setUser(res.data));
    
    // Fetch agents
    api.get('/agents').then(res => setAgents(res.data.agents));
    
    // Calculate trial days
    if (user?.trialExpiresAt) {
      const days = Math.ceil(
        (new Date(user.trialExpiresAt).getTime() - Date.now()) / 
        (24 * 60 * 60 * 1000)
      );
      setTrialDaysLeft(Math.max(0, days));
    }
  }, []);

  const handleUpgrade = async () => {
    const res = await api.post('/billing/sumup-checkout', {});
    window.location.href = res.data.checkoutUrl;
  };

  return (
    <div className="max-w-2xl mx-auto py-12">
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
      
      <div className="bg-surface border border-border rounded p-6 mb-6">
        <p className="text-muted">Trial Status</p>
        {trialDaysLeft > 0 ? (
          <p className="text-2xl font-bold text-green">{trialDaysLeft} days left</p>
        ) : (
          <div>
            <p className="text-2xl font-bold text-danger">Trial expired</p>
            <button
              onClick={handleUpgrade}
              className="w-full bg-grid text-bg font-bold py-3 rounded mt-4"
            >
              Upgrade to Pro ($9/month)
            </button>
          </div>
        )}
      </div>
      
      <div>
        <h2 className="text-xl font-bold mb-4">Your Agents ({agents.length}/1)</h2>
        {agents.map(agent => (
          <div key={agent.tenantId} className="bg-surface border border-border rounded p-4 mb-2">
            <p className="font-bold">{agent.agentName}</p>
            <p className="text-muted text-sm">Status: {agent.status}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
```

#### Hour 7-8: Routing + Mobile Responsive
```tsx
// services/clawdrop-wizard/src/App.tsx

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SignupPage />} />
        <Route path="/wizard" element={<ProtectedRoute><WizardPage /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
};

// All components responsive (mobile-first)
const containerClass = "max-w-md sm:max-w-lg md:max-w-2xl mx-auto px-4";
```

---

## 🔗 DAY 3: Integration + Testing (8 hours)

### Owner: DevOps / Full-Stack

### Checklist

#### Hour 0-2: Email + Agent Creation Flow
- [ ] Test: Signup email → verify → create agent → mock deploy
```bash
# Step 1: Signup
curl -X POST http://localhost:3000/api/v1/auth/email-signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "firstName": "Test"
  }'
# Returns: { token, user, trialExpiresAt }

# Step 2: Verify email (check console for code)
curl -X POST http://localhost:3000/api/v1/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "verificationCode": "123456"}'

# Step 3: Create agent (with JWT token)
curl -X POST http://localhost:3000/api/v1/agents \
  -H "Authorization: Bearer JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agentName": "My Agent", "botToken": "x", "botUsername": "x"}'
```

#### Hour 2-4: Phantom Wallet Flow
- [ ] Install Phantom extension (Chrome)
- [ ] Test: Connect wallet → sign message → create agent → deploy
- [ ] Verify signature validation works
- [ ] Check: Only 1 trial per wallet

#### Hour 4-5: Trial Expiration
- [ ] Manually set `trial_expires_at` to yesterday in database
- [ ] Verify: User can't create agent (quota exceeded)
- [ ] Verify: Error message displayed

#### Hour 5-6: SumUp Payment Flow
- [ ] Create SumUp test account
- [ ] Test checkout link works
- [ ] Simulate payment completion via webhook
- [ ] Verify: `subscription_tier` changes to 'pro' in database
- [ ] Verify: User can now create more agents (if trial ended)

#### Hour 6-7: Error Handling
- [ ] Invalid email format
- [ ] Duplicate email signup
- [ ] Wrong verification code
- [ ] Invalid Phantom signature
- [ ] API key errors
- [ ] Network errors

#### Hour 7-8: Docker Compose + Deployment
```yaml
# docker-compose.yml
version: '3.8'
services:
  bot:
    build: ./services/storefront-bot
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      DATABASE_URL: ./hfsp.db
      JWT_SECRET: ${JWT_SECRET}
      SUMUP_API_KEY: ${SUMUP_API_KEY}
    volumes:
      - ./data:/app/data

  wizard:
    build: ./services/clawdrop-wizard
    ports:
      - "5173:5173"
    environment:
      VITE_API_URL: http://localhost:3000/api/v1

  db:
    image: sqlite:latest
    volumes:
      - ./data:/data
```

```bash
# Start all services
docker-compose up

# Test
curl http://localhost:3000/health
# {status: "ok", database: "connected"}

curl http://localhost:5173/
# Returns wizard UI
```

---

## ✅ Definition of Done (DoD)

### Must Have (MVPfor 3 days):
- [ ] Email signup endpoint working
- [ ] Phantom wallet signup working
- [ ] Email + wallet combo validation (1 trial per combo)
- [ ] Trial auto-activation (14 days)
- [ ] SumUp checkout endpoint
- [ ] SumUp webhook (update subscription)
- [ ] SignupPage (email + phantom options)
- [ ] SetupWizard (create agent)
- [ ] DashboardPage (view agents, trial countdown)
- [ ] Mobile responsive
- [ ] All endpoints tested with Postman
- [ ] docker-compose.yml working
- [ ] End-to-end testing passed

### Nice to Have (after 3 days):
- [ ] Real Docker provisioning (complex)
- [ ] VPS SSH setup
- [ ] Real WebSocket provisioning status
- [ ] Email verification templates
- [ ] Advanced error recovery
- [ ] Analytics
- [ ] Admin dashboard

---

## 🎯 Hour-by-Hour Timeline

```
DAY 1 (Backend):
08:00 - 09:00: Database setup + dependencies
09:00 - 12:00: Email auth endpoints (signup, verify, login)
12:00 - 13:00: LUNCH
13:00 - 15:00: Phantom wallet auth
15:00 - 16:00: Trial system
16:00 - 17:00: SumUp checkout + webhook
17:00 - 18:00: Testing all endpoints (Postman)

DAY 2 (Frontend):
08:00 - 09:00: Vite setup + folder structure
09:00 - 12:00: SignupPage (email + phantom components)
12:00 - 13:00: LUNCH
13:00 - 15:00: SetupWizard component
15:00 - 16:00: DashboardPage component
16:00 - 17:00: Routing + mobile responsive CSS
17:00 - 18:00: API integration + basic styling

DAY 3 (Integration):
08:00 - 10:00: Email signup → agent creation flow
10:00 - 12:00: Phantom wallet flow
12:00 - 13:00: LUNCH
13:00 - 15:00: Trial expiration + SumUp payment
15:00 - 17:00: Error handling + edge cases
17:00 - 18:00: Docker-compose + final testing
```

---

## 🚀 Getting Started NOW

### Immediate Actions:

1. **Right now:**
   - [ ] Approve this sprint plan
   - [ ] Get SumUp API keys
   - [ ] Assign backend & frontend engineers

2. **In 30 minutes:**
   - [ ] Backend engineer starts database migration
   - [ ] Frontend engineer creates vite project

3. **By end of hour 1:**
   - [ ] Database running with new schema
   - [ ] Frontend project created and building
   - [ ] Both teams have local dev environment

4. **By end of day 1:**
   - [ ] All backend endpoints working (tested with Postman)

5. **By end of day 2:**
   - [ ] Full UI workflow working
   - [ ] Connected to real backend API

6. **By end of day 3:**
   - [ ] Ready for launch! 🚀

---

## 📊 Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| SumUp account setup | Get credentials TODAY |
| Email delivery slow | Use console in dev, mock email in testing |
| Phantom signature bugs | Test with real wallet before using |
| JSON deserialization | Use strict zod validation |
| Database locks | Use SQLite WAL mode (default) |
| CORS issues | Configure CORS properly from start |

---

## ✨ Final Notes

- **No real Docker provisioning yet** - Just return mocked success after 5 sec
- **No VPS SSH yet** - That's phase 2
- **Focus on auth + paywall MVP** - Everything else after launch
- **All endpoints must be testable with Postman** - Don't build if can't test
- **Mobile responsive from start** - CSS classes ready Day 1
- **Error messages friendly** - Tell users what went wrong + how to fix

---

**Good luck! You've got this! 🚀**

Let's make magic! ✨
