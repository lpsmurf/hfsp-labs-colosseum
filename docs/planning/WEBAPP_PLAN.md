# Telegram Web App Implementation Plan

**Status:** 📋 Approved  
**Date:** April 1, 2026  
**Author:** Claude  
**Scope:** Transform @hfsp_agent_bot into hybrid bot + Telegram Web App  

---

## Executive Summary

HFSP currently uses a 13-step Telegram bot wizard for agent provisioning. This plan transforms it into a **hybrid architecture**:

- **Bot** → Notifications + quick commands + agent pairing
- **Web App** → Setup forms + agent management + real-time status

**Benefits:**
- ✅ Better forms (multi-field instead of step-by-step)
- ✅ Visual feedback (progress, real-time updates)
- ✅ Mobile-optimized experience
- ✅ Professional UI with dark mode
- ✅ Agent management dashboard

**Timeline:** 20-30 hours (2-4 days)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    User Interfaces                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Telegram Bot (@hfsp_agent_bot)  │  Web App (hfsp.cloud/app)
│  ─────────────────────────────   │  ─────────────────────────
│  • /start menu                    │  • Setup form (all fields)
│  • Notifications                  │  • Agent dashboard
│  • Pairing flow (6-char code)    │  • Real-time status
│  • Quick commands                 │  • Search + filters
│  └─────────────────────────────┬──┘
│                                 │
└─────────────────────────────────┼─────────────────────────┘
                                  │
                    Express API + WebSocket
                                  │
                    Shared SQLite Database
```

---

## Technology Stack

### Frontend (Web App)

| Tech | Purpose | Why |
|------|---------|-----|
| **React 18** | UI framework | Component-based, fast development |
| **TypeScript** | Type safety | Catch errors before runtime |
| **TailwindCSS** | Styling | Mobile-first responsive design |
| **Telegram Web App SDK** | Integration | Auth, theme colors, haptic feedback |
| **React Hook Form** | Form handling | Lightweight, great performance |
| **Zod** | Validation | Type-safe schema validation |
| **React Query** | Data fetching | Caching, real-time updates |
| **Vite** | Bundler | Fast builds, dev server |

### Backend (Modifications)

- **Express** (existing) - Add 3 new routes
- **WebSocket** (new) - Real-time provisioning status
- **SQLite** (existing) - Shared database
- **Telegram SDK** - HMAC validation for authentication

---

## Implementation Plan

### Phase 1: Web App Framework (2-3 hours)

**Create `services/webapp/` with React + TypeScript:**

```bash
npm create vite@latest webapp -- --template react-ts
cd webapp
npm install
  - react-router-dom (routing)
  - axios (API client)
  - @twa-dev/types (Telegram types)
  - react-query (data management)
  - zod + react-hook-form (forms)
  - tailwindcss (styling)
```

**Deliverables:**
- ✅ Project structure with Vite
- ✅ Telegram SDK wrapper hook (`useTelegramApp`)
- ✅ Authentication flow (validate initData → get JWT)
- ✅ Base layout (header + footer + mobile viewport)
- ✅ Client-side routing (React Router)

### Phase 2: Setup Form Component (4-5 hours)

**Build multi-field agent setup form with:**

- Agent name (text input, 1-60 chars)
- Bot token (text input, validation)
- Bot username (text input)
- Template selection (radio buttons: Blank / Ops Starter)
- Provider selection (radio buttons: OpenAI / Anthropic / OpenRouter)
- API key input (password field, visibility toggle)
- Model preset (radio buttons: Fast / Smart)

**Features:**
- Real-time validation (field-level)
- Error messages with helpful hints
- Submit button disabled until valid
- Loading state during submission
- Success/error toast notifications
- Form reset on success

**Deliverables:**
- ✅ SetupWizard component (form logic)
- ✅ Form validation schemas (Zod)
- ✅ Error handling + user feedback
- ✅ Integration with API

### Phase 3: Dashboard Component (3-4 hours)

**Build agent management interface:**

**Agent List:**
- Table or card layout (responsive)
- Columns: Name, Bot, Status, Created, Actions
- Status badges (active/provisioning/failed/archived)

**Features:**
- Search by agent name
- Filter by status
- Sort by date/name
- Pagination (10 per page)
- Real-time status updates (badges refresh)

**Actions per agent:**
- View details
- View dashboard (SSH tunnel)
- Pause/stop
- Archive
- Delete (with confirmation)

**Deliverables:**
- ✅ AgentDashboard component
- ✅ AgentCard component (for list items)
- ✅ Search + filter + sort logic
- ✅ Action handlers (delete, pause, etc.)
- ✅ Real-time status badges

### Phase 4: Real-Time Updates (3-4 hours)

**WebSocket integration for live provisioning:**

**New bot endpoint:** `/ws/provisioning/:tenantId`

**Event stream:**
1. `provisioning_started` → Show spinner
2. `ssh_key_installed` → Step 1/4 complete
3. `container_started` → Step 2/4 complete
4. `provisioning_complete` → Step 3/4, show instructions
5. `provisioning_failed` → Show error + retry button

**Features:**
- Progress indicator (step indicators or bar)
- Estimated time remaining
- Auto-reconnect on disconnect (with backoff)
- Cancel provisioning button
- Retry on failure

**Deliverables:**
- ✅ WebSocket endpoint on bot
- ✅ `useProvisioning` hook (client-side)
- ✅ ProvisioningStatus component
- ✅ Progress indicators

### Phase 5: Bot Integration (2-3 hours)

**Update Telegram bot for hybrid operation:**

**New bot flows:**

1. `/start` command:
   ```
   Welcome to HFSP!
   
   [Open Web App] → Opens hfsp.cloud/app
   [View My Agents] → Shows agent list in app
   [Help] → Shows help text
   ```

2. **Provisioning notifications:**
   ```
   When user starts provisioning in web app:
   → Bot sends: "🚀 Starting provisioning..."
   
   When provisioning completes:
   → Bot sends: "✅ Agent ready! Open app to pair"
   
   When provisioning fails:
   → Bot sends: "❌ Provisioning failed: [error]"
   ```

3. **Keep existing agent pairing flow:**
   - User gets 6-char code from web app
   - Pastes code to bot
   - Bot pairs with agent runtime
   - User can interact with agent

**Deliverables:**
- ✅ Updated `/start` with "Open App" button
- ✅ Notification system (via database flags)
- ✅ Agent pairing flow (unchanged)

### Phase 6: Deployment (1-2 hours)

**Two deployment options:**

**Option A: Serve from bot (recommended)**
```
npm run build                  # Build web app to dist/
Express route: GET /app        # Serves index.html
Express route: GET /app/*      # Serves assets from dist/
```

**Option B: External deployment**
```
Deploy to Vercel/Netlify
Set Telegram webhook to: hfsp.cloud/api/...
Web app at: app.hfsp.cloud
```

**Deliverables:**
- ✅ Production build working
- ✅ Assets served correctly
- ✅ HTTPS enabled (for Telegram)
- ✅ Mobile app testing completed

---

## Critical Implementation Details

### 1. Authentication Flow (Security)

```
Client: window.Telegram.WebApp.initData (contains encrypted user info)
  ↓
  Client sends initData to server
  ↓
Server: Validate HMAC-SHA256(initData, BOT_TOKEN)
  - If invalid: reject (security breach)
  - If valid: extract telegram_user_id
  ↓
Server: Generate JWT token (expires 1 hour)
  ↓
Client: Use JWT for all API requests
  - Header: Authorization: Bearer {JWT}
  - On expiry: refresh token via /api/webapp/auth
```

**Never send initData to client-side APIs** (it contains secrets)

### 2. Real-Time Updates (WebSocket)

```
Client connects: POST /api/provisioning/:tenantId
  ↓
Server creates WebSocket connection
  ↓
Server emits events:
  {
    "event": "provisioning_started",
    "tenant_id": "t_abc123",
    "timestamp": "2026-04-01T10:00:00Z"
  }
  
  {
    "event": "ssh_key_installed",
    "step": "2/4",
    "message": "SSH key configured"
  }
  
  ... more events ...
  
  {
    "event": "provisioning_complete",
    "agent_id": "...",
    "pairing_code": "ABC123"
  }
  ↓
Client updates UI in real-time (no refresh needed)
```

**Auto-reconnect strategy:**
- Close: exponential backoff (1s, 2s, 4s, 8s, max 60s)
- Reconnect: up to 5 times, then show "connection lost" error
- User can manually retry

### 3. Mobile Optimization

| Aspect | Implementation |
|--------|-----------------|
| Viewport | `<meta viewport="width=device-width, initial-scale=1">` |
| Full height | App takes full viewport (no scrollbars in Telegram) |
| Touch targets | Buttons minimum 48x48px (iOS guidelines) |
| Dark mode | Detect `Telegram.WebApp.colorScheme` |
| Theme colors | Use Telegram's primaryColor + backgroundColor |
| Haptic feedback | `Telegram.WebApp.HapticFeedback.light()` on button press |
| Responsive | TailwindCSS breakpoints: sm/md/lg/xl |

### 4. Form Validation

```typescript
// Zod schema
const agentSetupSchema = z.object({
  agentName: z.string().min(1).max(60),
  botToken: z.string().regex(/^\d+:AA[A-Za-z0-9_-]+$/),
  botUsername: z.string().regex(/^[A-Za-z0-9_]{5,}$/),
  template: z.enum(['blank', 'ops_starter']),
  provider: z.enum(['openai', 'anthropic', 'openrouter']),
  apiKey: z.string().min(20),
  preset: z.enum(['fast', 'smart']),
});

// Real-time validation as user types
<input
  value={agentName}
  onChange={(e) => {
    setValue('agentName', e.target.value);
    // Validation happens automatically via react-hook-form + zod
  }}
  aria-invalid={!!errors.agentName}
/>
{errors.agentName && <span>{errors.agentName.message}</span>}
```

---

## File Structure

```
services/webapp/
├── public/
│   └── index.html                    # Telegram Web App entry point
├── src/
│   ├── components/
│   │   ├── SetupWizard.tsx          # Multi-field form component
│   │   ├── AgentDashboard.tsx       # Agent list + management
│   │   ├── ProvisioningStatus.tsx   # Real-time provisioning UI
│   │   ├── AgentCard.tsx            # Single agent card
│   │   └── shared/
│   │       ├── Button.tsx           # Reusable button
│   │       ├── Input.tsx            # Reusable input
│   │       ├── Modal.tsx            # Modal dialog
│   │       └── Toast.tsx            # Toast notifications
│   ├── pages/
│   │   ├── Home.tsx                 # Main dashboard
│   │   ├── Setup.tsx                # Setup page
│   │   ├── Agent.tsx                # Single agent detail
│   │   └── NotFound.tsx             # 404 page
│   ├── hooks/
│   │   ├── useTelegramApp.ts        # Telegram SDK wrapper
│   │   ├── useAuth.ts               # JWT auth + refresh
│   │   ├── useAgents.ts             # Agent list + CRUD
│   │   ├── useProvisioning.ts       # Real-time provisioning
│   │   └── useWebSocket.ts          # WebSocket management
│   ├── services/
│   │   ├── api.ts                   # Axios API client
│   │   ├── telegram.ts              # Telegram SDK wrapper
│   │   └── websocket.ts             # WebSocket client
│   ├── types/
│   │   ├── telegram.ts              # Telegram types
│   │   ├── agent.ts                 # Agent/tenant types
│   │   └── api.ts                   # API response types
│   ├── App.tsx                      # Root + routing
│   ├── main.tsx                     # Entry point
│   ├── index.css                    # Global styles (Tailwind)
│   └── env.d.ts                     # Type definitions
├── .env.example
├── tsconfig.json
├── vite.config.ts
└── package.json

services/storefront-bot/
└── src/
    └── index.ts (ADDITIONS)
        ├── GET /app                          # Serve web app
        ├── POST /api/webapp/auth             # Validate + JWT
        ├── WS /ws/provisioning/:tenantId     # Real-time updates
        └── Enhanced provisioning notifications
```

---

## Integration with Existing Code

### Reuse Existing:

1. **Admin API** (`services/admin-api/src/index.ts`)
   - `/api/tenants` → Fetch agent list
   - `/api/tenants/:id` → Fetch agent details
   - `/api/tenants/:id/status` → Real-time status
   - `/DELETE /api/tenants/:id` → Delete agent

2. **Bot Provisioning Logic** (`services/storefront-bot/src/index.ts`)
   - Keep all existing provisioning code unchanged
   - Just add notification hooks
   - Reuse `provisioner.provision()` method

3. **VPS Registry** (`services/storefront-bot/src/vps-registry.ts`)
   - Display cluster capacity in web app
   - Show node utilization

4. **Provisioners** (`services/storefront-bot/src/provisioners/`)
   - Already abstracted (ShellProvisioner + MultiVpsProvisioner)
   - Web app doesn't need to know about provisioning details

### New Backend Routes Needed:

```typescript
// GET /app - Serve web app
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, '../webapp/dist/index.html'));
});

// GET /app/* - Serve web app assets
app.use('/app', express.static(path.join(__dirname, '../webapp/dist')));

// POST /api/webapp/auth - Validate Telegram token, return JWT
app.post('/api/webapp/auth', (req, res) => {
  const { initData } = req.body;
  
  // Validate HMAC
  const secret = crypto.createHmac('sha256', BOT_TOKEN).update('WebAppData').digest();
  const hmac = initData.split('&').find(p => p.startsWith('hash=')).split('=')[1];
  const dataCheckString = initData.split('&').filter(p => !p.startsWith('hash=')).sort().join('\n');
  
  const calculatedHmac = crypto.createHmac('sha256', secret)
    .update(dataCheckString)
    .digest('hex');
  
  if (hmac !== calculatedHmac) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  // Extract user ID
  const initDataUnsafe = Object.fromEntries(new URLSearchParams(initData));
  const user = JSON.parse(initDataUnsafe.user);
  
  // Generate JWT
  const token = jwt.sign(
    { telegram_user_id: user.id },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  
  res.json({ token });
});

// WS /ws/provisioning/:tenantId - Real-time provisioning updates
app.ws('/ws/provisioning/:tenantId', (ws, req) => {
  const { tenantId } = req.params;
  const userId = req.user.telegram_user_id; // From JWT
  
  // Check ownership (user owns this tenant)
  const tenant = db.prepare(
    'SELECT * FROM tenants WHERE tenant_id = ? AND telegram_user_id = ?'
  ).get(tenantId, userId);
  
  if (!tenant) {
    ws.close(4001, 'Unauthorized');
    return;
  }
  
  // Track provisioning state
  provisioner.on(`provision:${tenantId}:started`, () => {
    ws.send(JSON.stringify({
      event: 'provisioning_started',
      timestamp: new Date().toISOString()
    }));
  });
  
  // ... more events ...
});
```

---

## Testing Strategy

### Unit Tests
- Form validation (valid/invalid inputs)
- Component rendering (mock API)
- Telegram SDK (mock window.Telegram)

### Integration Tests  
- Auth flow (validate initData, generate JWT)
- Agent provisioning flow (submit form → WebSocket updates)
- Real-time updates (WebSocket connection/reconnection)

### Manual Testing (Critical)
- **Telegram mobile app** (iOS/Android) - Primary test environment
- **Telegram desktop** - Secondary test environment
- **Web browser** - Fallback test environment
- **Slow network** (3G) - Performance testing
- **Dark mode** - Theme testing
- **Multiple agents** (10+) - Load testing

---

## Timeline

| Phase | Duration | Cumulative |
|-------|----------|-----------|
| Phase 1: Framework | 2-3h | 2-3h |
| Phase 2: Form | 4-5h | 6-8h |
| Phase 3: Dashboard | 3-4h | 9-12h |
| Phase 4: Real-time | 3-4h | 12-16h |
| Phase 5: Bot integration | 2-3h | 14-19h |
| Phase 6: Deployment | 1-2h | 15-21h |
| **Testing + refinement** | **4-6h** | **20-30h** |

**Recommended schedule:**
- Day 1: Phases 1-2 (6-8 hours)
- Day 2: Phases 3-4 (6-8 hours)
- Day 3: Phases 5-6 (3-5 hours)
- Day 3-4: Testing (4-6 hours)

---

## Success Criteria

### Functional
- ✅ Web app loads in <2 seconds on Telegram
- ✅ Agent setup form works with all validations
- ✅ Real-time provisioning status (no manual refresh needed)
- ✅ Agent dashboard shows all agents with correct status
- ✅ Search/filter/sort functionality works

### User Experience
- ✅ Mobile-optimized (responsive, touch-friendly buttons)
- ✅ Dark mode matches Telegram theme
- ✅ Error messages are helpful
- ✅ Loading states are clear
- ✅ Bot still works for notifications

### Security
- ✅ Telegram initData validated server-side (HMAC)
- ✅ JWT tokens used for API auth (not initData)
- ✅ User can only access their own agents
- ✅ All API calls require valid JWT

### Performance
- ✅ Initial page load <2 seconds
- ✅ Form submission <5 seconds
- ✅ WebSocket updates <500ms latency
- ✅ Agent list renders smoothly (10+ items)

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Telegram SDK issues | Medium | High | Test extensively on real Telegram apps |
| HMAC validation bugs | Low | Critical | Follow Telegram docs carefully, validate on both sides |
| WebSocket connection loss | Medium | Medium | Auto-reconnect with exponential backoff |
| Form validation edge cases | Medium | Low | Comprehensive unit tests |
| Mobile layout issues | Medium | Medium | Test on multiple devices + browser DevTools |
| Database concurrent access | Low | Medium | Use existing db connection pooling |

---

## Rollout Strategy

**Phase 1 (Week 1): Internal testing**
- Developers and early users only
- Gather feedback on UX
- Fix critical bugs

**Phase 2 (Week 2): Limited rollout**
- 10-20% of users get "Try new web app" message
- Monitor for issues
- Collect feedback

**Phase 3 (Week 3): Full rollout**
- All users see "Open Web App" button
- Keep bot as fallback
- Monitor performance

**Phase 4 (Month 2): Deprecation (optional)**
- If web app stable for 1+ month
- Consider deprecating button-based wizard
- But keep bot for notifications

---

## Questions for Implementation

1. **Deployment location?**
   - Option A: Serve from bot server (/app route)
   - Option B: Deploy to Vercel/Netlify (separate URL)

2. **Real-time notifications in bot?**
   - Should bot send notifications when provisioning starts/completes?
   - Or only show status in web app?

3. **Agent management scope?**
   - Should web app support editing agent config?
   - Or just view/delete/pause?

4. **Admin dashboard access?**
   - Should web app show admin dashboard (for admins)?
   - VPS cluster status, user management, etc.?

---

## Next Steps

1. ✅ **This document approved by:** [User]
2. **Create React project** with Vite
3. **Build Phase 1** (Framework + auth)
4. **Build Phase 2-4** (Form + Dashboard + Real-time)
5. **Integrate with bot** (Phase 5)
6. **Deploy and test** (Phase 6)
7. **Collect feedback** and iterate

---

**Document Version:** 1.0  
**Last Updated:** April 1, 2026  
**Status:** 📋 Ready for Implementation  
