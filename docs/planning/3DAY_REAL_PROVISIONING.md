# ⚡ 3-DAY SPRINT - REAL DOCKER + API DOCS + DASHBOARD

**Status:** Updated scope  
**Changes:**
- ✅ Real Docker provisioning (using existing provisioner)
- ✅ API documentation (OpenAPI/Swagger)
- ✅ User dashboard (agent management + account)
- ✅ Crypto payment (Solana)

**Timeline:** 3-4 days (tight but doable)

---

## 🎯 Updated Goals

**Day 1-2:** Backend (auth + provisioning + API docs)  
**Day 2:** Frontend (signup + dashboard)  
**Day 3:** Integration + testing  

---

## 📚 API Documentation (OpenAPI/Swagger)

### Why:
- Users/developers see all endpoints
- Auto-generated swagger UI
- Easy to test endpoints
- Documentation stays in sync with code

### Implementation:

```bash
# Add to services/storefront-bot/package.json
npm install swagger-ui-express swagger-jsdoc
```

```typescript
// services/storefront-bot/src/swagger.ts

import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import express from 'express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'HFSP API',
      version: '1.0.0',
      description: 'Agent provisioning API'
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:3000',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    }
  },
  apis: [
    './src/routes/*.ts',
    './src/index.ts'
  ]
};

const specs = swaggerJsdoc(options);

export function setupSwagger(app: express.Application) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
  app.get('/swagger.json', (req, res) => res.json(specs));
}
```

```typescript
// services/storefront-bot/src/routes/auth.ts

/**
 * @swagger
 * /api/v1/auth/email-signup:
 *   post:
 *     summary: Sign up with email
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               firstName:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 */
app.post('/api/v1/auth/email-signup', handleEmailSignup);
```

### Access Docs:
```
http://localhost:3000/api-docs
```

---

## 🎨 User Dashboard

### What to Build:

**Dashboard Pages:**
1. **Home/Overview**
   - Agent count
   - Trial status (days left)
   - Quick stats

2. **Agents List**
   - All user's agents
   - Status (active, provisioning, failed)
   - Created date
   - Actions (view, delete, pause)

3. **Create Agent**
   - Form: name, template, provider, model
   - Real-time provisioning progress
   - Success message with instructions

4. **Agent Detail**
   - Config display
   - Status / logs
   - Dashboard link
   - Delete button

5. **Account**
   - Email / wallet address
   - Subscription tier
   - Trial countdown
   - Upgrade button

6. **Upgrade**
   - Show QR code (Solana Pay)
   - Instructions
   - Payment verification

### File Structure:
```
services/clawdrop-wizard/src/
├── pages/
│   ├── DashboardHome.tsx
│   ├── AgentsList.tsx
│   ├── CreateAgent.tsx
│   ├── AgentDetail.tsx
│   ├── Account.tsx
│   └── Upgrade.tsx
├── components/
│   ├── Sidebar.tsx
│   ├── AgentCard.tsx
│   ├── ProvisioningProgress.tsx
│   ├── UpgradeModal.tsx
│   └── shared/
└── hooks/
    ├── useAgents.ts
    ├── useDashboard.ts
    └── useUser.ts
```

---

## 🐳 Real Docker Provisioning (Using Existing Architecture)

### How It Works:

```
User creates agent
    ↓
Backend calls: provisioner.provision({agentName, botToken, provider, ...})
    ↓
Provisioner (ShellProvisioner) via SSH:
  1. Generate SSH key
  2. Create /opt/hfsp/tenants/{tenantId}/
  3. Write openclaw.json config
  4. Write secret files (API keys)
  5. docker run hfsp/openclaw-runtime:stable
    ↓
Container starts, connects to Telegram
    ↓
Agent ready ✅
```

### Integration with Existing Code:

```typescript
// services/storefront-bot/src/index.ts

import { ProvisionerFactory } from './provisioners';
import { VpsRegistry } from './vps-registry';

// Initialize provisioner
const vpsRegistry = new VpsRegistry(db);
const provisioner = ProvisionerFactory.createProvisioner(
  {
    sshKey: process.env.TENANT_VPS_SSH_KEY,
    runtimeImage: process.env.TENANT_RUNTIME_IMAGE || 'hfsp/openclaw-runtime:stable',
    basedir: process.env.TENANT_VPS_BASEDIR || '/opt/hfsp/tenants'
  },
  {
    mode: process.env.PROVISIONER_MODE || 'shell',
    vpsRegistry,
    vpsHost: process.env.TENANT_VPS_HOST,
    vpsUser: process.env.TENANT_VPS_USER
  }
);

// When user creates agent
app.post('/api/v1/agents', authenticate, rateLimit, async (req, res) => {
  const userId = req.user.userId;
  const { agentName, botToken, botUsername, provider, apiKey } = req.body;
  
  // Create agent record (pending)
  const tenantId = generateId('t');
  db.prepare(`
    INSERT INTO tenants (tenant_id, telegram_user_id, agent_name, bot_token, status)
    VALUES (?, ?, ?, ?, 'provisioning')
  `).run(tenantId, userId, agentName, botToken);
  
  // Encrypt API key
  const encrypted = encryptApiKey(apiKey);
  db.prepare(`
    INSERT INTO api_secrets (tenant_id, encrypted_api_key, encryption_iv)
    VALUES (?, ?, ?)
  `).run(tenantId, encrypted.encrypted, encrypted.iv);
  
  res.status(201).json({ tenantId, status: 'provisioning' });
  
  // Async: provision in background
  (async () => {
    try {
      const result = await provisioner.provision({
        tenantId,
        agentName,
        templateId: 'blank',
        provider,
        modelPreset: 'smart',
        botToken,
        botUsername,
        [provider === 'anthropic' ? 'anthropicApiKey' : 'openaiApiKey']: apiKey
      });
      
      if (result.success) {
        db.prepare(`
          UPDATE tenants SET
            status = 'active',
            container_id = ?,
            provisioned_at = ?
          WHERE tenant_id = ?
        `).run(result.containerName, new Date(), tenantId);
        
        // Send WebSocket update
        ws.emit(`provision:${tenantId}:complete`, {
          agentId: tenantId,
          message: 'Agent ready!'
        });
      } else {
        db.prepare(`
          UPDATE tenants SET status = 'failed', provisioning_error = ?
          WHERE tenant_id = ?
        `).run(result.error, tenantId);
      }
    } catch (err) {
      db.prepare(`
        UPDATE tenants SET status = 'failed', provisioning_error = ?
        WHERE tenant_id = ?
      `).run(err.message, tenantId);
    }
  })();
});
```

### WebSocket for Real-Time Progress:

```typescript
// WS /ws/provisioning/:tenantId

app.ws('/ws/provisioning/:tenantId', async (ws, req) => {
  const { tenantId } = req.params;
  const userId = req.user.userId;
  
  // Verify ownership
  const tenant = db.prepare(
    'SELECT * FROM tenants WHERE tenant_id = ? AND telegram_user_id = ?'
  ).get(tenantId, userId);
  
  if (!tenant) {
    ws.close(4003, 'Forbidden');
    return;
  }
  
  // Send current status
  const logs = db.prepare(`
    SELECT event_type, message FROM provisioning_logs
    WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 5
  `).all(tenantId);
  
  ws.send(JSON.stringify({ type: 'status_snapshot', logs }));
  
  // Listen for updates
  const handler = (event) => ws.send(JSON.stringify(event));
  eventEmitter.on(`provision:${tenantId}`, handler);
  
  ws.on('close', () => {
    eventEmitter.off(`provision:${tenantId}`, handler);
  });
});
```

---

## 📅 Updated 3-Day Timeline

### Day 1: Backend Auth + Provisioning + Docs (10 hours)

**Hour 0-1:** Setup
- [ ] Create database migration 008 (crypto payment fields)
- [ ] Add dependencies: `swagger-jsdoc`, `swagger-ui-express`

**Hour 1-4:** Email + Phantom Auth (same as before)
- [ ] Email signup + verification
- [ ] Phantom wallet signup + verification

**Hour 4-6:** Crypto Payment (Solana)
- [ ] Solana wallet generation
- [ ] QR code + Solana Pay link
- [ ] Payment status endpoint

**Hour 6-8:** API Documentation
- [ ] Setup Swagger
- [ ] Document all auth endpoints
- [ ] Document all agent endpoints
- [ ] Test Swagger UI

**Hour 8-10:** Provisioning Integration
- [ ] Wire up ProvisionerFactory
- [ ] Test real Docker provisioning (local or staging VPS)
- [ ] WebSocket event streaming
- [ ] Error handling + recovery

### Day 2: Frontend Auth + Dashboard (10 hours)

**Hour 0-2:** Signup UI
- [ ] SignupPage (email OR phantom)
- [ ] EmailSignupForm
- [ ] PhantomSignupForm

**Hour 2-4:** Dashboard Home + Layout
- [ ] Sidebar navigation
- [ ] DashboardHome (overview + stats)
- [ ] Account page (show subscription)

**Hour 4-7:** Agents Management
- [ ] AgentsList page
- [ ] CreateAgent page + form
- [ ] AgentDetail page
- [ ] Delete/pause actions

**Hour 7-9:** Provisioning UI
- [ ] ProvisioningProgress component (real WebSocket)
- [ ] Upgrade modal (show QR + instructions)

**Hour 9-10:** Mobile Responsive + Polish
- [ ] Responsive CSS
- [ ] Error handling
- [ ] Loading states

### Day 3: Integration + Testing (10 hours)

**Hour 0-3:** Full Flow Testing
- [ ] Email signup → create agent → real provisioning
- [ ] Phantom wallet → create agent → real provisioning
- [ ] WebSocket real-time updates working
- [ ] Agent appears in dashboard

**Hour 3-6:** Payment Flow Testing
- [ ] Upgrade button shows QR code
- [ ] Solana Pay link works
- [ ] Manual payment verification
- [ ] Trial countdown shows correctly

**Hour 6-8:** Error Scenarios + Edge Cases
- [ ] Invalid credentials
- [ ] Provisioning failure → retry
- [ ] Network errors
- [ ] Quota enforcement (1 agent trial, 10 agents pro)

**Hour 8-10:** Final Testing + Deployment
- [ ] docker-compose up → everything runs
- [ ] Swagger docs accessible
- [ ] Mobile responsive on real device
- [ ] All endpoints tested with Postman
- [ ] Ready to launch! 🚀

---

## ✅ Success Criteria (3-4 Days)

### By EOD Day 1:
- [ ] All auth endpoints working (Postman tested)
- [ ] Crypto payment endpoint working
- [ ] Swagger docs at /api-docs
- [ ] Database migration applied
- [ ] Real Docker provisioning integrated (tested locally)

### By EOD Day 2:
- [ ] Signup UI complete (email + Phantom)
- [ ] Dashboard home + navigation complete
- [ ] Create agent form complete
- [ ] Agent list page complete
- [ ] Account page complete
- [ ] Mobile responsive
- [ ] All connected to backend API

### By EOD Day 3:
- [ ] Full signup → provisioning → dashboard flow works
- [ ] Real Docker containers deploy
- [ ] WebSocket real-time updates work
- [ ] Solana Pay QR code displays
- [ ] Payment verification works
- [ ] All error scenarios handled
- [ ] docker-compose deployment ready
- [ ] Swagger docs complete
- [ ] **READY TO LAUNCH! 🚀**

---

## 📁 Deliverables

### Backend:
- ✅ API with real Docker provisioning
- ✅ Complete OpenAPI/Swagger documentation
- ✅ Crypto payment integration (Solana)
- ✅ WebSocket real-time updates
- ✅ Complete error handling

### Frontend:
- ✅ Signup flow (email + Phantom)
- ✅ User dashboard
- ✅ Agent management (CRUD)
- ✅ Real-time provisioning progress
- ✅ Mobile responsive
- ✅ Account management

### Deployment:
- ✅ docker-compose.yml
- ✅ .env configuration
- ✅ All documented

---

## 🚀 What's Different (vs Mocking)

| Aspect | Mocking | Real |
|--------|---------|------|
| **Deployment** | Return fake success | Actually creates Docker container |
| **Testing** | Can't test real Docker | Tests actual infrastructure |
| **Time** | Saves 4-5 hours | Uses existing provisioner (saves time!) |
| **Confidence** | Low (might fail in prod) | High (tested in real environment) |
| **Users** | Fake agents | Real agents ready to use |

**Using your existing provisioner = FASTER, not slower!**

---

## 🎯 Pre-Sprint Setup

Before starting:
- [ ] Read this document
- [ ] Check provisioner code in repo
- [ ] Ensure Docker installed on VPS
- [ ] Test VPS SSH access works
- [ ] Review Dockerfile for openclaw-runtime
- [ ] Get Swagger docs examples from existing API projects
- [ ] Ensure team familiar with provisioner architecture

---

## 💡 Why This Works in 3 Days

1. **You have the hard part done:** Provisioner + Docker already built
2. **You have the architecture:** Existing docs + code
3. **You have the database:** Schema ready
4. **Focus is narrow:** Auth + UI + integration only
5. **WebSocket already planned:** Real-time updates ready to wire up

**No mocking = no rework later!**

---

## 🚀 Let's Ship!

**Timeline:** 3-4 days  
**Team:** Backend + Frontend + DevOps  
**Result:** Production-ready agent provisioning platform

Ready to build? 💪

