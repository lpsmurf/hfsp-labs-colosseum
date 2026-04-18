# ⚡ START NOW - Hour-by-Hour Day 1

**Timer starts:** NOW  
**Goal:** Functional backend endpoints by EOD  
**Team:** Backend + Frontend + DevOps all active

---

## 🎬 RIGHT NOW (Next 5 Minutes)

### All Team Members:
```bash
cd /Users/mac/hfsp-agent-provisioning

# Pull latest
git pull origin main

# Read these docs (parallel reading)
cat START_HERE.md
cat REALITY_CHECK.md
cat ACTION_PLAN_3DAYS.md
```

### Backend Engineer:
```bash
# Prepare environment
cd services/storefront-bot
cp .env.example .env

# Edit .env with:
JWT_SECRET=dev_secret_12345
SOLANA_WALLET_ADDRESS=YOUR_WALLET_HERE
HFSP_DB_SECRET=dev_db_secret_12345
```

### Frontend Engineer:
```bash
# Create new project structure
cd /Users/mac/hfsp-agent-provisioning/services

# Create wizard project (this takes 2 min)
npm create vite@latest clawdrop-wizard -- --template react-ts
cd clawdrop-wizard
npm install
```

### DevOps:
```bash
# Verify VPS access + Docker
ssh -i ~/.ssh/your_key root@YOUR_VPS_IP "docker --version"
# Should output: Docker version X.X.X

# Test locally
docker --version
docker-compose --version
```

---

## ⏱️ HOUR 1 (Backend Focused)

### Backend Engineer - Database Migration

**Duration:** 60 minutes

```bash
cd /Users/mac/hfsp-agent-provisioning/services/storefront-bot

# Step 1: Check current schema
sqlite3 ../../../data/hfsp.db ".schema users"

# Step 2: Create migration file
cat > migrations/008-add-email-auth.sql << 'SQL'
-- Add email/phantom auth columns to users
ALTER TABLE users ADD COLUMN email TEXT UNIQUE;
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN phantom_wallet_address TEXT UNIQUE;
ALTER TABLE users ADD COLUMN subscription_tier TEXT DEFAULT 'free_trial';
ALTER TABLE users ADD COLUMN trial_started_at DATETIME;
ALTER TABLE users ADD COLUMN trial_expires_at DATETIME;

-- Create crypto payments table
CREATE TABLE IF NOT EXISTS crypto_payments (
  payment_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount_usdc REAL,
  status TEXT DEFAULT 'pending',
  transaction_signature TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  confirmed_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_crypto_payments_user ON crypto_payments(user_id);
SQL

# Step 3: Apply migration
sqlite3 ../../../data/hfsp.db < migrations/008-add-email-auth.sql

# Step 4: Verify
sqlite3 ../../../data/hfsp.db ".schema users" | grep -E "email|password|phantom|subscription|trial"

# If all columns shown → Migration successful! ✅
```

**Check if done:**
- [ ] Database has new columns (email, password_hash, phantom_wallet_address, subscription_tier, trial_started_at, trial_expires_at)
- [ ] crypto_payments table created
- [ ] Can see all columns in schema

---

## ⏱️ HOUR 2 (Backend Continues)

### Backend Engineer - Email Auth Endpoint

**Duration:** 60 minutes

```bash
cd /Users/mac/hfsp-agent-provisioning/services/storefront-bot/src

# Step 1: Add dependencies
npm install bcrypt nodemailer nacl qrcode

# Step 2: Create auth routes file
cat > routes/auth-new.ts << 'TYPESCRIPT'
import express, { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import nacl from 'tweetnacl';
import { PublicKey } from '@solana/web3.js';
import QRCode from 'qrcode';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

// POST /api/v1/auth/email-signup
router.post('/email-signup', async (req: Request, res: Response) => {
  try {
    const { email, password, firstName } = req.body;
    
    // Validate
    if (!email?.includes('@')) {
      return res.status(400).json({ error: 'Invalid email' });
    }
    if ((password || '').length < 8) {
      return res.status(400).json({ error: 'Password too short (min 8 chars)' });
    }
    
    // Check duplicate
    const db = require('../database'); // Adjust path as needed
    const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Create user with trial
    const userId = `u_${Math.random().toString(36).slice(2, 11)}`;
    const trialExpiresAt = new Date();
    trialExpiresAt.setDate(trialExpiresAt.getDate() + 14);
    
    db.prepare(`
      INSERT INTO users (
        user_id, email, password_hash, subscription_tier,
        trial_started_at, trial_expires_at, first_name
      ) VALUES (?, ?, ?, 'free_trial', ?, ?, ?)
    `).run(userId, email, passwordHash, new Date(), trialExpiresAt, firstName || '');
    
    // Generate JWT
    const token = jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '24h' });
    
    // Send verification code (for MVP: just log it)
    const verificationCode = Math.random().toString().slice(2, 8);
    console.log(`\n📧 VERIFICATION CODE FOR ${email}: ${verificationCode}\n`);
    
    res.status(201).json({
      token,
      user: { userId, email, subscription: 'free_trial', trialExpiresAt },
      message: 'Account created! Check console for verification code (in dev mode)'
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/v1/auth/verify-email
router.post('/verify-email', async (req: Request, res: Response) => {
  // For MVP: just mark as verified
  // Later: validate code
  res.json({ email_verified: true, message: 'Email verified!' });
});

// POST /api/v1/auth/phantom-signup
router.post('/phantom-signup', async (req: Request, res: Response) => {
  try {
    const { walletAddress, signedMessage, message } = req.body;
    
    // Verify signature
    try {
      const encoded = new TextEncoder().encode(message);
      const publicKey = new PublicKey(walletAddress);
      const valid = nacl.sign.detached.verify(
        encoded,
        Buffer.from(signedMessage, 'base64'),
        publicKey.toBuffer()
      );
      
      if (!valid) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
    } catch (err) {
      return res.status(401).json({ error: 'Signature verification failed' });
    }
    
    // Check existing
    const db = require('../database');
    const existing = db.prepare(
      'SELECT * FROM users WHERE phantom_wallet_address = ?'
    ).get(walletAddress);
    if (existing) {
      return res.status(400).json({ error: 'Wallet already registered' });
    }
    
    // Create user with trial
    const userId = `u_${Math.random().toString(36).slice(2, 11)}`;
    const trialExpiresAt = new Date();
    trialExpiresAt.setDate(trialExpiresAt.getDate() + 14);
    
    db.prepare(`
      INSERT INTO users (
        user_id, phantom_wallet_address, subscription_tier,
        trial_started_at, trial_expires_at
      ) VALUES (?, ?, 'free_trial', ?, ?)
    `).run(userId, walletAddress, new Date(), trialExpiresAt);
    
    const token = jwt.sign({ userId, wallet: walletAddress }, JWT_SECRET, { expiresIn: '24h' });
    
    res.status(201).json({
      token,
      user: { userId, wallet: walletAddress, subscription: 'free_trial', trialExpiresAt },
      message: 'Wallet connected! Free trial activated (14 days, 1 agent)'
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/v1/billing/upgrade-to-pro
router.post('/upgrade-to-pro', async (req: Request, res: Response) => {
  try {
    const merchantWallet = process.env.SOLANA_WALLET_ADDRESS || '11111111111111111111111111111111';
    
    // Generate QR code
    const solanaPayLink = `solana:${merchantWallet}?amount=9&label=HFSP+Pro`;
    const qrCode = await QRCode.toDataURL(solanaPayLink);
    
    res.json({
      walletAddress: merchantWallet,
      amountUsdc: 9,
      solanaPayLink,
      qrCode,
      message: 'Send 9 USDC to this address to upgrade'
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
TYPESCRIPT

# Step 3: Wire routes into main app
# Edit services/storefront-bot/src/index.ts
# Add near the top:
# import authRoutes from './routes/auth-new';
# app.use('/api/v1/auth', authRoutes);
```

**Verify:**
```bash
# Restart bot
npm run dev
# Should see: "Server running on port 3000"

# Test email signup (in another terminal)
curl -X POST http://localhost:3000/api/v1/auth/email-signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","firstName":"Test"}'

# Should return: { token, user, message }
```

**Check if done:**
- [ ] routes/auth-new.ts created
- [ ] Dependencies installed (bcrypt, nacl, qrcode)
- [ ] Routes wired into index.ts
- [ ] Email signup endpoint returns token
- [ ] Phantom signup endpoint defined

---

## ⏱️ HOUR 3 (Frontend Starts)

### Frontend Engineer - Project Setup

**Duration:** 60 minutes

```bash
cd /Users/mac/hfsp-agent-provisioning/services/clawdrop-wizard

# Step 1: Install core dependencies
npm install react-router-dom axios zod react-hook-form tailwindcss

# Step 2: Create folder structure
mkdir -p src/{pages,components,hooks,services,types}

# Step 3: Setup Tailwind
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# Step 4: Create basic App.tsx
cat > src/App.tsx << 'TSX'
import { BrowserRouter, Routes, Route } from 'react-router-dom';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SignupPage />} />
      </Routes>
    </BrowserRouter>
  );
}

function SignupPage() {
  return (
    <div className="max-w-md mx-auto py-12 px-4">
      <h1 className="text-3xl font-bold mb-6">Sign Up</h1>
      <p className="text-gray-600">Coming soon...</p>
    </div>
  );
}
TSX

# Step 5: Start dev server
npm run dev
# Should open: http://localhost:5173
```

**Check if done:**
- [ ] services/clawdrop-wizard created
- [ ] npm install completed
- [ ] npm run dev works (shows "Sign Up" page)
- [ ] Folder structure created

---

## ⏱️ HOUR 4 (DevOps + Backend Debugging)

### DevOps - Docker & docker-compose

**Duration:** 60 minutes

```bash
cd /Users/mac/hfsp-agent-provisioning

# Step 1: Create docker-compose.yml
cat > docker-compose.yml << 'YAML'
version: '3.8'
services:
  api:
    build: ./services/storefront-bot
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: development
      DATABASE_URL: ./data/hfsp.db
      JWT_SECRET: dev_secret_12345
      SOLANA_WALLET_ADDRESS: 11111111111111111111111111111111
    volumes:
      - ./data:/app/data
    command: npm run dev

  wizard:
    build: ./services/clawdrop-wizard
    ports:
      - "5173:5173"
    environment:
      VITE_API_URL: http://localhost:3000/api/v1
    command: npm run dev
YAML

# Step 2: Test docker-compose
docker-compose up --build
# Should see both services starting
```

### Backend Engineer - Test Endpoints

**In parallel, test with Postman:**

```bash
# Test 1: Email signup
POST http://localhost:3000/api/v1/auth/email-signup
{
  "email": "alice@example.com",
  "password": "securepass123",
  "firstName": "Alice"
}
# Expected: 201 + token

# Test 2: Phantom signup (mock for now)
POST http://localhost:3000/api/v1/auth/phantom-signup
{
  "walletAddress": "11111111111111111111111111111111",
  "signedMessage": "mock_signature",
  "message": "verify"
}
# Expected: 201 + token (or error - that's OK for now)

# Test 3: Upgrade endpoint
POST http://localhost:3000/api/v1/billing/upgrade-to-pro
# Expected: 200 + QR code
```

**Check if done:**
- [ ] docker-compose.yml created
- [ ] docker-compose up works
- [ ] Email signup returns token
- [ ] Upgrade endpoint returns QR code
- [ ] Both services running

---

## 🏁 END OF HOUR 4 (Day 1 - 4 Hours Done)

### Deliverables:
✅ Database migration applied  
✅ Email signup endpoint working  
✅ Phantom signup endpoint defined  
✅ Solana QR code endpoint working  
✅ Frontend project running  
✅ docker-compose ready  

### Team Status:
- **Backend:** 4 endpoints working, tested
- **Frontend:** Project setup, ready for UI
- **DevOps:** docker-compose running, all services online

### Next (Hours 5-8 of Day 1):
- Backend: Solana payment verification + trial logic
- Frontend: Email signup form component
- Both: Continuous testing

---

## 💪 You're 25% Done!

**Keep momentum:**
- Continue with next hours
- Daily standup at 8 AM
- Slack for blockers
- End of day: Review progress

**You've got this! 🚀**

