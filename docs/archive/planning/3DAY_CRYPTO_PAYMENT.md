# ⚡ 3-DAY SPRINT - CRYPTO PAYMENT UPDATE

**Status:** Critical clarification  
**Change:** SumUp → Pure Crypto Payment (Solana)  
**Impact:** Simpler, faster implementation  
**Timeline:** Still 3 days ✅  

---

## 🔄 What Changed

### OLD (with SumUp fiat):
```
Trial expires → "Upgrade to Pro" → SumUp checkout → Pay $9 in USD
```

### NEW (pure crypto):
```
Trial expires → "Upgrade to Pro" → Show wallet address → User sends SOL/USDC
```

---

## 💎 Crypto Payment Model (Simplified)

### Payment Flow:
```
1. User clicks "Upgrade to Pro"
   ↓
2. System generates wallet address to receive payment
   (or shows your fixed merchant wallet)
   ↓
3. Display QR code + wallet address
   (or use Solana Pay link)
   ↓
4. User scans QR / opens wallet
   ↓
5. User sends SOL (e.g., 0.5 SOL = ~$60/month worth)
   ↓
6. You receive transaction on-chain
   ↓
7. User's subscription → "pro" (manual confirmation for now)
   ↓
8. Agent limit → 10 agents unlocked
```

### Simple Implementation (3-day version):
```typescript
// Day 1: Backend - Just show wallet address + amount needed
POST /api/v1/billing/upgrade-to-pro
Response: {
  walletAddress: "your_merchant_wallet_address",
  amountSol: 0.5,
  qrCode: "https://...",
  solanaPayLink: "solana:your_address?amount=0.5&label=HFSP+Pro"
}

// Day 3: Check transaction manually via Solana Explorer
// Update database manually when payment confirmed
// (or use webhook later)
```

---

## 🛠️ Implementation Approach

### Option 1: Solana Pay (Easiest for MVP) ✅ RECOMMENDED
```typescript
// Generate Solana Pay link (one-time setup)
const merchantWallet = "your_solana_wallet_address";
const amount = 0.5;  // SOL
const label = "HFSP Pro Monthly";
const message = "Upgrade to Pro Plan";

const solanaPayLink = 
  `solana:${merchantWallet}?amount=${amount}&label=${label}&message=${message}`;

// User scans QR code in Phantom wallet
// Payment sent immediately
// You see transaction in Solana Explorer

// Later (Day 4+): Add webhook to auto-confirm
```

### Option 2: USDC (Stablecoin) 
```typescript
// Same as above but with USDC token
// 9 USDC = ~$9/month
// More predictable pricing
```

### Option 3: SPL Token (Your own token)
```typescript
// Create your own SPL token
// Users hold your token to access service
// (Can do later - too complex for 3 days)
```

---

## 📋 Updated Day 1: Backend (with Crypto)

### Remove:
```typescript
❌ SumUp API integration
❌ SumUp webhook handler
❌ Stripe/payment processing logic
```

### Add:
```typescript
✅ Generate Solana Pay link
✅ Display wallet address + amount
✅ Show QR code
✅ Manual payment verification endpoint (for now)
```

### Code Example:
```typescript
// services/storefront-bot/src/routes/billing.ts

import QRCode from 'qrcode';

const MERCHANT_WALLET = process.env.SOLANA_WALLET_ADDRESS;
const PRO_PRICE_SOL = 0.5;  // $9 worth of SOL

// POST /api/v1/billing/upgrade-to-pro
export async function createUpgradeCheckout(req: Request, res: Response) {
  const userId = req.user.userId;
  
  // Generate Solana Pay link
  const solanaPayLink = 
    `solana:${MERCHANT_WALLET}?amount=${PRO_PRICE_SOL}&label=HFSP+Pro&message=Monthly+Subscription`;
  
  // Generate QR code
  const qrCode = await QRCode.toDataURL(solanaPayLink);
  
  // Store in database for later verification
  db.prepare(`
    INSERT INTO pending_payments (user_id, amount_sol, created_at, status)
    VALUES (?, ?, ?, ?)
  `).run(userId, PRO_PRICE_SOL, new Date(), 'pending');
  
  return res.json({
    walletAddress: MERCHANT_WALLET,
    amountSol: PRO_PRICE_SOL,
    solanaPayLink,
    qrCode,
    message: `Send ${PRO_PRICE_SOL} SOL to ${MERCHANT_WALLET}`
  });
}

// GET /api/v1/billing/payment-status/:userId
// (for checking if payment received - manual for now)
export async function checkPaymentStatus(req: Request, res: Response) {
  const userId = req.params.userId;
  
  const pending = db.prepare(`
    SELECT * FROM pending_payments 
    WHERE user_id = ? AND status = 'pending'
    ORDER BY created_at DESC LIMIT 1
  `).get(userId);
  
  if (!pending) {
    return res.json({ status: 'no_pending_payment' });
  }
  
  // Manual: Check Solana blockchain
  // For MVP: Return "awaiting_verification"
  // Later: Use @solana/web3.js to check if transaction confirmed
  
  return res.json({
    status: 'pending',
    expected: `${pending.amount_sol} SOL`,
    wallet: MERCHANT_WALLET
  });
}

// POST /api/v1/billing/confirm-payment
// (Manual endpoint - admin confirms via Solana Explorer)
export async function confirmPayment(req: Request, res: Response) {
  const { userId, transactionSignature } = req.body;
  
  // For MVP: Just mark as confirmed (no verification)
  // Later: Verify transaction signature on Solana blockchain
  
  db.prepare(`
    UPDATE pending_payments SET status = 'confirmed' WHERE user_id = ?
  `).run(userId);
  
  db.prepare(`
    UPDATE users SET subscription_tier = 'pro' WHERE user_id = ?
  `).run(userId);
  
  return res.json({ status: 'upgraded' });
}
```

---

## 📱 Updated Day 2: Frontend (with Crypto)

### Remove:
```typescript
❌ SumUp redirect logic
❌ SumUp payment form
```

### Add:
```typescript
✅ Display Solana Pay QR code
✅ Show wallet address
✅ Show amount in SOL
✅ Instructions for user
✅ Check payment status (poll for confirmation)
```

### Code Example:
```typescript
// services/clawdrop-wizard/src/components/UpgradeModal.tsx

export const UpgradeModal: React.FC = ({ user, onUpgrade }) => {
  const [checkoutData, setCheckoutData] = useState(null);
  const [checking, setChecking] = useState(false);

  const handleUpgrade = async () => {
    // Get upgrade checkout info (includes QR code)
    const res = await api.post('/billing/upgrade-to-pro', {});
    setCheckoutData(res.data);
  };

  const checkPayment = async () => {
    setChecking(true);
    const res = await api.get(`/billing/payment-status/${user.userId}`);
    
    if (res.data.status === 'confirmed') {
      // Payment confirmed!
      onUpgrade();
      alert('✅ Payment confirmed! Welcome to Pro!');
    } else {
      alert('⏳ Payment not yet confirmed. Checking blockchain...');
      // Keep checking in a few seconds
      setTimeout(checkPayment, 5000);
    }
    setChecking(false);
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-surface border border-border rounded">
      {!checkoutData ? (
        <>
          <h2 className="text-2xl font-bold mb-4">Upgrade to Pro</h2>
          <p className="text-muted mb-4">
            Pay with Solana • Get 10 agents • Cancel anytime
          </p>
          <button
            onClick={handleUpgrade}
            className="w-full bg-blue text-white py-3 rounded font-bold"
          >
            Upgrade to Pro ($9/month in SOL)
          </button>
        </>
      ) : (
        <>
          <h2 className="text-2xl font-bold mb-4">Send Payment</h2>
          
          {/* QR Code */}
          <div className="bg-white p-4 rounded mb-4 text-center">
            <img 
              src={checkoutData.qrCode} 
              alt="Solana Pay QR"
              className="w-48 h-48 mx-auto"
            />
          </div>
          
          {/* Wallet Address */}
          <div className="bg-surface2 p-4 rounded mb-4">
            <p className="text-muted text-sm mb-1">Wallet Address:</p>
            <code className="text-grid font-mono text-sm break-all">
              {checkoutData.walletAddress}
            </code>
          </div>
          
          {/* Amount */}
          <div className="bg-surface2 p-4 rounded mb-4">
            <p className="text-muted text-sm mb-1">Amount:</p>
            <p className="text-2xl font-bold text-green">
              {checkoutData.amountSol} SOL
            </p>
          </div>
          
          {/* Instructions */}
          <div className="bg-surface2 p-4 rounded mb-4 text-sm">
            <p className="font-bold mb-2">📱 How to pay:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted">
              <li>Open your Phantom wallet</li>
              <li>Click "Send"</li>
              <li>Enter the wallet address or scan QR</li>
              <li>Enter amount: {checkoutData.amountSol} SOL</li>
              <li>Confirm & send</li>
            </ol>
          </div>
          
          {/* Check Status */}
          <button
            onClick={checkPayment}
            disabled={checking}
            className="w-full bg-grid text-bg py-3 rounded font-bold"
          >
            {checking ? 'Checking...' : '✓ I Sent Payment'}
          </button>
          
          <p className="text-muted text-xs text-center mt-2">
            Payment may take 30-60 seconds to confirm
          </p>
        </>
      )}
    </div>
  );
};
```

---

## 📊 Updated Database Schema

### Instead of SumUp fields:
```sql
-- Remove:
ALTER TABLE users DROP COLUMN sumup_customer_id;
ALTER TABLE users DROP COLUMN sumup_subscription_id;

-- Add:
ALTER TABLE users ADD COLUMN (
  solana_wallet_address TEXT,  -- User's wallet (optional)
  subscription_started_at DATETIME
);

-- New table for pending/confirmed payments
CREATE TABLE crypto_payments (
  payment_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount_sol REAL,
  status TEXT DEFAULT 'pending',  -- pending, confirmed, failed
  transaction_signature TEXT,
  created_at DATETIME,
  confirmed_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);
```

---

## 🔐 Security (Crypto Version)

### Good News:
```
✅ No credit card data to store
✅ No PCI compliance needed
✅ No fiat gateway security concerns
✅ Blockchain verification is permanent
```

### You Still Need:
```
✅ HTTPS for API (always)
✅ Rate limiting (prevent abuse)
✅ Don't log wallet addresses
✅ Verify signatures server-side (later)
```

---

## ⏱️ Updated 3-Day Timeline

### Day 1: Backend (8 hours)
```
Hour 0-1: Database setup (remove SumUp, add crypto_payments table)
Hour 1-3: Email signup + Phantom wallet signup (same as before)
Hour 3-5: Solana wallet generation endpoint
Hour 5-6: QR code generation + Solana Pay link
Hour 6-7: Payment status check endpoint (manual for now)
Hour 7-8: Testing all endpoints
```

### Day 2: Frontend (8 hours)
```
Hour 0-1: Vite setup + folder structure
Hour 1-3: SignupPage (email + phantom)
Hour 3-4: SetupWizard (create agent)
Hour 4-5: DashboardPage
Hour 5-6: UpgradeModal component (show QR + instructions)
Hour 6-7: Payment status polling
Hour 7-8: Mobile responsive + styling
```

### Day 3: Integration + Testing (8 hours)
```
Hour 0-2: Email signup → create agent → upgrade flow
Hour 2-4: Phantom wallet → create agent → upgrade flow
Hour 4-5: Solana Pay QR code works
Hour 5-6: Manual payment verification works
Hour 6-7: Error handling + edge cases
Hour 7-8: docker-compose + final testing
```

---

## 🧪 Testing Crypto Payment (Day 3)

### Setup (Before testing):
```bash
# Install Solana CLI
brew install solana-cli

# Get test wallet address
solana-keygen pubkey ~/.config/solana/id.json
# Example: 9B5DwDvm9SKv6nqfBx5JW5jfpgm6g8mQJB8hEpk7nWYg
```

### Test Payment Flow:
```
1. User clicks "Upgrade to Pro"
2. QR code appears with Solana Pay link
3. Open Phantom wallet → scan QR
4. Phantom shows: "Send 0.5 SOL to 9B5DwDvm9SKv6nqfBx5JW5jfpgm6g8mQJB8hEpk7nWYg"
5. User confirms payment
6. Transaction sent on Solana blockchain
7. User clicks "I Sent Payment"
8. Backend polls Solana Explorer (or webhook later)
9. Payment confirmed → subscription_tier = 'pro'
10. User can now create 10 agents
```

### Check on Solana Explorer:
```
https://explorer.solana.com/?cluster=devnet
(Search for your wallet address to see test transactions)
```

---

## 🚀 Day 4+ (After MVP Launch)

Once users are paying with crypto, you can later add:
- ✅ Automatic payment verification via @solana/web3.js
- ✅ Webhook handler for transactions
- ✅ Display user's Solana wallet
- ✅ Multi-token support (USDC, USDT, etc)
- ✅ Fiat onramp (SumUp) for non-crypto users
- ✅ Monthly subscription automation

---

## 💰 Pricing Questions

**What should 0.5 SOL be priced as?**

Current SOL price: ~$130-150
0.5 SOL = ~$65-75 worth

Options:
1. **Fixed SOL amount:** Always 0.5 SOL (price varies with market)
2. **Fixed USD equivalent:** Always $9 USDC (or ~0.06 SOL if SOL=150)
3. **Mixed:** Offer both SOL and USDC

**Recommendation for MVP:**
→ Use USDC (stablecoin) = Always 9 USDC
→ Simpler for users (predictable price)
→ Easier accounting

**Updated Code:**
```typescript
const PRO_PRICE_USDC = 9;  // Always $9
const PRO_PRICE_SOL = 0.06;  // Varies with market
// User chooses: Pay with SOL or USDC
```

---

## 🎯 Final 3-Day Checklist (Crypto Version)

### Day 1 End:
- [ ] Email signup working
- [ ] Phantom wallet signup working
- [ ] Solana wallet generation working
- [ ] QR code + Solana Pay link generated
- [ ] Payment status endpoint working
- [ ] All tested with Postman

### Day 2 End:
- [ ] Signup UI working
- [ ] Create agent UI working
- [ ] Dashboard UI working
- [ ] UpgradeModal with QR code rendering
- [ ] Mobile responsive

### Day 3 End:
- [ ] Full signup → upgrade → payment flow works
- [ ] QR code scans in Phantom wallet
- [ ] Manual payment confirmation works
- [ ] docker-compose up → everything runs
- [ ] Ready to launch! 🚀

---

## ✅ Updated Summary

**Pure Crypto Payment = Simpler MVP!**

```
OLD (SumUp):
  + Familiar to fiat users
  - Complex webhook handling
  - Requires merchant account setup
  - Higher fees (2-3%)

NEW (Solana):
  + Instant settlement
  + No middleman
  + Lower fees
  + Permanent record on blockchain
  - Users need wallet
  - Manual verification in MVP (auto later)
```

---

## 🚀 You're Ready!

This version is **SIMPLER** than the SumUp version.

**Why?**
- No webhook complexity
- No payment processor account setup
- Just generate QR code + show address
- Manual verification for MVP
- Upgrade to auto-verification later

**Timeline:** Still 3 days ✅

Let's do this! 💪

