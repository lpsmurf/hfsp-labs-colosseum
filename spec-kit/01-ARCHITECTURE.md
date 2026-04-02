# HFSP Agent Provisioning - System Architecture Spec

**Version:** 1.0  
**Status:** Ready for Implementation  
**Date:** April 3, 2026  
**Scope:** Complete fullstack architecture for agent deployment platform  

---

## 1. System Overview

### What We're Building

A **multi-tenant, Telegram-first agent provisioning platform** that allows users to:
1. Create custom AI agents (powered by Claude, OpenAI, or other LLMs)
2. Deploy agents to isolated Docker containers
3. Manage agents via a hybrid Telegram bot + web app
4. Connect agents to Telegram for real-time interaction

### Core Design Principles

| Principle | Implementation |
|-----------|-----------------|
| **Tenant Isolation** | One container per agent/customer on dedicated VPS |
| **Security First** | JWT tokens, HMAC validation, encrypted secrets |
| **Real-time UX** | WebSocket for live provisioning status |
| **Mobile-First** | Telegram Web App optimized for phones |
| **Scalability** | Multi-VPS support, distributed tenant registry |

---

## 2. System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                         USER INTERFACES                                │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  Telegram Bot          Telegram Web App      ClawDrop Wizard          │
│  @hfsp_agent_bot       (hfsp.cloud/app)    (Standalone Deployment)   │
│  ───────────────       ─────────────────    ──────────────────────   │
│  • /start menu         • Setup form         • Agent setup form       │
│  • Notifications       • Dashboard          • Status monitoring      │
│  • Agent pairing       • Real-time updates  • Advanced config        │
│  • Quick commands      • Search/filters     • Multi-provider setup   │
│                                                                        │
└───────────────────────────┬──────────────────┬────────────────────────┘
                            │                  │
                    Express API + WebSocket    │
                            │                  │
                ┌───────────┴──────────────────┘
                │
        ┌───────▼──────────┐
        │  Storefront Bot  │
        │    Service       │
        ├──────────────────┤
        │  • Auth & JWT    │
        │  • Provisioning  │
        │  • Notifications │
        │  • API endpoints │
        │  • WebSocket     │
        │    handler       │
        └───────┬──────────┘
                │
    ┌───────────┼──────────────┐
    │           │              │
┌───▼────┐  ┌──▼───┐    ┌─────▼────┐
│ SQLite │  │ VPS  │    │ Provisioner
│  DB    │  │Regs  │    │  (Docker)
└────────┘  └──────┘    └──────────┘
    │                        │
    └────────────┬───────────┘
                 │
        ┌────────▼────────┐
        │  Tenant VPS(s)  │
        ├─────────────────┤
        │ • Tenant A      │
        │   └─ Container  │
        │ • Tenant B      │
        │   └─ Container  │
        │ • Tenant C      │
        │   └─ Container  │
        └─────────────────┘
```

### 2.1 Service Components

#### **Storefront Bot Service**
- **Technology:** Node.js + Express + TypeScript
- **Responsibilities:**
  - Telegram bot webhook handling
  - JWT token generation & validation
  - Agent provisioning orchestration
  - WebSocket real-time updates
  - Notification delivery
  - Database management (SQLite)

#### **Tenant VPS Cluster**
- **Technology:** Docker containers running OpenClaw runtime
- **Responsibilities:**
  - Isolated agent execution
  - Agent-to-Telegram connection
  - Secret management per-tenant
  - SSH access for admin/troubleshooting
  - Logs aggregation

#### **VPS Registry Service** (embedded in Storefront Bot)
- **Responsibilities:**
  - Track available VPS nodes
  - Load balancing (round-robin, least-busy)
  - Capacity planning
  - Node health checks

---

## 3. Data Flow Architecture

### 3.1 Agent Setup Flow

```
User (Telegram Web App)
    │
    ├─ 1. Enters agent config
    │    (name, template, provider, API key, model)
    │
    ├─ 2. Clicks "Deploy Agent"
    │    └─ POST /api/agents
    │       ├─ Validate JWT token
    │       ├─ Validate form schema (Zod)
    │       ├─ Check user quota
    │       ├─ Store in database (pending state)
    │       └─ Emit WebSocket: "provisioning_started"
    │
    ├─ 3. VPS Selection
    │    ├─ Query available VPS nodes
    │    ├─ Pick least-busy node (round-robin)
    │    └─ Reserve tenant slot
    │
    ├─ 4. SSH Key Generation
    │    ├─ Generate unique SSH keypair
    │    ├─ Store public key on VPS
    │    └─ Emit WebSocket: "ssh_key_installed"
    │
    ├─ 5. Docker Container Creation
    │    ├─ Create /opt/hfsp/tenants/<tenant_id>/
    │    ├─ Write openclaw.json (agent config)
    │    ├─ Write secret files (API keys)
    │    ├─ Start Docker container
    │    └─ Emit WebSocket: "container_started"
    │
    ├─ 6. Agent Initialization
    │    ├─ Container starts OpenClaw runtime
    │    ├─ Runtime connects to Telegram
    │    └─ Emit WebSocket: "agent_ready"
    │
    ├─ 7. Pairing Flow
    │    ├─ User gets 6-char pairing code
    │    ├─ Pastes code to bot (/pair command)
    │    ├─ Bot validates & auto-approves
    │    └─ Agent goes "active"
    │
    └─ 8. Completion
         ├─ Update database: status = "active"
         ├─ Show in dashboard
         └─ Emit WebSocket: "provisioning_complete"
```

### 3.2 Agent Pairing Flow

```
User's Agent Container
    │
    ├─ User starts DM: "/pair"
    │    └─ Agent replies with 6-char code (e.g. "A52X7ABQ")
    │
    ├─ User copies code → pastes to @hfsp_agent_bot
    │    │
    │    ├─ Telegram bot receives: "/pair A52X7ABQ"
    │    ├─ Bot looks up pairing in database
    │    ├─ Validates tenant_id + user_id match
    │    ├─ Marks pairing as "approved"
    │    ├─ Notifies container via API call
    │    │
    │    └─ Container receives approval
    │         ├─ Updates internal state
    │         └─ Agent now accepts user commands
    │
    └─ User starts chatting normally
```

### 3.3 Real-Time Update Flow (WebSocket)

```
Storefront Bot (Event Source)
    │
    ├─ Monitors container startup progress via SSH
    │
    ├─ Emits events:
    │   {
    │     "event": "provisioning_started",
    │     "tenant_id": "t_abc123",
    │     "timestamp": "2026-04-03T10:00:00Z"
    │   }
    │
    │   {
    │     "event": "ssh_key_installed",
    │     "step": "1/4",
    │     "message": "SSH key configured"
    │   }
    │
    │   {
    │     "event": "container_started",
    │     "step": "2/4",
    │     "message": "Docker container running"
    │   }
    │
    │   {
    │     "event": "agent_initialized",
    │     "step": "3/4",
    │     "message": "OpenClaw runtime ready",
    │     "pairing_code": "A52X7ABQ"
    │   }
    │
    │   {
    │     "event": "provisioning_complete",
    │     "step": "4/4",
    │     "agent_id": "t_abc123",
    │     "message": "Agent ready! Pair it in Telegram"
    │   }
    │
    ├─ Error event:
    │   {
    │     "event": "provisioning_failed",
    │     "error": "SSH connection timeout",
    │     "retry_available": true
    │   }
    │
    └─ WebSocket server broadcasts to connected clients
         │
         └─ Web App receives → Updates UI in real-time
              └─ Shows progress bar, status messages
```

---

## 4. Technology Stack

### Frontend (Web App + Wizard)

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Runtime** | React 18 | UI framework |
| **Language** | TypeScript | Type safety |
| **Build** | Vite | Fast development |
| **Styling** | TailwindCSS | Responsive design |
| **Forms** | React Hook Form + Zod | Validation & state |
| **Data Fetching** | Axios + React Query | API calls & caching |
| **Routing** | React Router v6 | SPA navigation |
| **Telegram Integration** | @twa-dev/sdk | Web app API |
| **Notifications** | Toast component | User feedback |
| **WebSocket Client** | Native WebSocket API | Real-time updates |

### Backend (Storefront Bot)

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Runtime** | Node.js 18+ | Server runtime |
| **Language** | TypeScript | Type safety |
| **Framework** | Express 4.x | Web server |
| **API Communication** | Axios | HTTP client |
| **WebSocket Server** | `ws` library | Real-time connection |
| **Telegram SDK** | `telegraf` | Bot framework |
| **Database** | SQLite 3 | Data persistence |
| **SSH Client** | `ssh2` | Remote provisioning |
| **Docker API** | `dockerode` | Container management |
| **Authentication** | JWT (jsonwebtoken) | Session tokens |
| **Validation** | Zod | Schema validation |
| **Logging** | `pino` | Structured logging |

### Deployment Infrastructure

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Web Hosting** | Vercel / Render / Heroku | Storefront bot service |
| **Database** | SQLite (file-based) | Tenant registry |
| **Tenant Hosts** | AWS EC2 / DigitalOcean / Custom VPS | Multi-VPS tenant containers |
| **Container Runtime** | Docker + Docker Compose | Agent isolation |
| **VCS** | GitHub | Code repository |
| **CI/CD** | GitHub Actions | Automated testing & deployment |
| **Monitoring** | Custom logging + CloudWatch/Datadog | Observability |

---

## 5. Database Schema

### Core Tables

#### `users`
```sql
CREATE TABLE users (
  telegram_user_id INTEGER PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  username TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_active DATETIME,
  subscription_tier TEXT DEFAULT 'free'  -- free, pro, enterprise
);
```

#### `tenants` (Agents)
```sql
CREATE TABLE tenants (
  tenant_id TEXT PRIMARY KEY,
  telegram_user_id INTEGER NOT NULL,
  agent_name TEXT NOT NULL,
  bot_token TEXT NOT NULL,
  bot_username TEXT NOT NULL,
  template TEXT,                    -- blank, ops_starter
  provider TEXT NOT NULL,           -- openai, anthropic, openrouter
  model TEXT,                       -- gpt-4, claude-3-opus, etc
  api_key_hash TEXT,               -- hash of API key (never store plain)
  preset TEXT,                      -- fast, smart
  vps_id TEXT,                     -- assigned VPS host
  vps_ip TEXT,
  vps_ssh_port INTEGER DEFAULT 22,
  container_id TEXT,
  status TEXT DEFAULT 'provisioning',  -- provisioning, active, paused, failed, archived
  pairing_status TEXT DEFAULT 'pending',  -- pending, paired, rejected
  pairing_code TEXT,
  pairing_user_id INTEGER,         -- Telegram user ID of agent DM
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  provisioned_at DATETIME,
  last_interaction DATETIME,
  error_message TEXT,
  FOREIGN KEY (telegram_user_id) REFERENCES users(telegram_user_id)
);

CREATE INDEX idx_tenants_user ON tenants(telegram_user_id);
CREATE INDEX idx_tenants_status ON tenants(status);
```

#### `vps_nodes` (Registry)
```sql
CREATE TABLE vps_nodes (
  vps_id TEXT PRIMARY KEY,
  host TEXT NOT NULL UNIQUE,        -- IP or hostname
  ssh_port INTEGER DEFAULT 22,
  ssh_username TEXT DEFAULT 'root',
  max_tenants INTEGER DEFAULT 100,  -- capacity limit
  current_tenants INTEGER DEFAULT 0,
  last_check DATETIME,
  status TEXT DEFAULT 'healthy',    -- healthy, degraded, offline
  region TEXT,                      -- us-east, eu-west, ap-south
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_vps_status ON vps_nodes(status);
```

#### `provisioning_logs`
```sql
CREATE TABLE provisioning_logs (
  log_id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  event_type TEXT,                 -- ssh_key_installed, container_started, etc
  message TEXT,
  error TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);

CREATE INDEX idx_logs_tenant ON provisioning_logs(tenant_id);
```

#### `api_secrets` (Encrypted)
```sql
CREATE TABLE api_secrets (
  secret_id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL UNIQUE,
  encrypted_api_key TEXT NOT NULL,  -- Encrypted with data at rest
  encryption_iv TEXT,
  encryption_method TEXT DEFAULT 'aes-256-gcm',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);
```

#### `notifications`
```sql
CREATE TABLE notifications (
  notification_id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_user_id INTEGER NOT NULL,
  tenant_id TEXT,
  notification_type TEXT,          -- provisioning_started, provisioning_failed, etc
  title TEXT,
  message TEXT,
  read BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_user_id) REFERENCES users(telegram_user_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);
```

---

## 6. API Specification Overview

### Authentication

**POST** `/api/webapp/auth`
- **Input:** Telegram initData
- **Output:** JWT token + user info
- **Purpose:** Web app authentication via Telegram signature validation

**POST** `/api/auth/refresh`
- **Input:** Refresh token
- **Output:** New JWT token
- **Purpose:** Token renewal without re-authentication

### Agent Management

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/agents` | List user's agents |
| GET | `/api/agents/:id` | Get agent details |
| POST | `/api/agents` | Create new agent |
| PUT | `/api/agents/:id` | Update agent config |
| DELETE | `/api/agents/:id` | Delete/archive agent |
| POST | `/api/agents/:id/pause` | Pause agent |
| POST | `/api/agents/:id/resume` | Resume agent |
| GET | `/api/agents/:id/logs` | Agent logs |
| POST | `/api/agents/:id/pair` | Initiate pairing |

### Provisioning

| Method | Endpoint | Purpose |
|--------|----------|---------|
| WS | `/ws/provisioning/:tenantId` | Real-time status stream |
| POST | `/api/provisioning/:id/retry` | Retry failed provisioning |
| GET | `/api/provisioning/:id/status` | Get current status |

### Admin

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/admin/vps` | List VPS nodes |
| POST | `/api/admin/vps` | Register new VPS |
| GET | `/api/admin/users` | List users (admin only) |
| GET | `/api/admin/stats` | System statistics |

---

## 7. Security Architecture

### Authentication Flow

```
┌─────────────────────────────────────┐
│  Telegram Web App User               │
│  (window.Telegram.WebApp.initData)   │
└──────────────────┬──────────────────┘
                   │
            Sends initData to server
                   │
        ┌──────────▼──────────┐
        │ Server validates    │
        │ HMAC-SHA256 using   │
        │ BOT_TOKEN           │
        └──────────┬──────────┘
                   │
            ┌──────▼──────┐
            │ Valid? Yes  │
            └──────┬──────┘
                   │
        ┌──────────▼──────────┐
        │ Extract user ID     │
        │ Generate JWT token  │
        │ (expires: 1 hour)   │
        └──────────┬──────────┘
                   │
    ┌──────────────▼──────────────┐
    │ Return JWT to client        │
    │ Client stores in memory     │
    │ (never localStorage!)       │
    └─────────────────────────────┘
```

### API Authorization

All API endpoints (except `/api/webapp/auth`) require:
```
Authorization: Bearer {JWT_TOKEN}
```

JWT payload structure:
```json
{
  "telegram_user_id": 123456789,
  "username": "john_doe",
  "iat": 1680520000,
  "exp": 1680523600,
  "sub": "webapp"
}
```

### Secret Management

**API Keys (Stored Encrypted):**
- Encrypted at rest with AES-256-GCM
- IV stored separately
- Never logged or exposed in API responses
- Decrypted only when injecting into container environment

**SSH Keys (Per-Tenant):**
- Generated uniquely per tenant
- Public key stored on VPS only
- Private key stored securely in database with encryption
- Used only for provisioning operations

**JWT Secret:**
- Stored in environment variable: `JWT_SECRET`
- Never committed to git
- Rotatable without downtime

---

## 8. Deployment Architecture

### Development Environment
```
Local Machine
  ├─ Web App: http://localhost:5173
  ├─ Bot API: http://localhost:3000
  ├─ SQLite: ./local.db
  └─ Test VPS: Mock or local Docker
```

### Production Environment
```
                    ┌──────────────────┐
                    │ Telegram Network │
                    └────────┬─────────┘
                             │
                    ┌────────▼──────────┐
                    │  Vercel / Render  │
                    │  Storefront Bot   │
                    │  + Web App        │
                    │                   │
                    │  ├─ Express app   │
                    │  ├─ SQLite DB     │
                    │  ├─ WebSocket srv │
                    │  └─ Provisioner   │
                    └────────┬──────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
        ┌─────▼────┐    ┌────▼─────┐  ┌───▼──────┐
        │ VPS Node │    │VPS Node 2│  │VPS Node 3│
        │ (us-east)│    │(eu-west) │  │(ap-south)│
        │          │    │          │  │          │
        │ ┌──────┐ │    │ ┌──────┐ │  │ ┌──────┐ │
        │ │Tenant│ │    │ │Tenant│ │  │ │Tenant│ │
        │ │ Pod  │ │    │ │ Pod  │ │  │ │ Pod  │ │
        │ │  A   │ │    │ │  B   │ │  │ │  C   │ │
        │ └──────┘ │    │ └──────┘ │  │ └──────┘ │
        │ ┌──────┐ │    │ ┌──────┐ │  │ ┌──────┐ │
        │ │Tenant│ │    │ │Tenant│ │  │ │Tenant│ │
        │ │ Pod  │ │    │ │ Pod  │ │  │ │ Pod  │ │
        │ │  D   │ │    │ │  E   │ │  │ │  F   │ │
        │ └──────┘ │    │ └──────┘ │  │ └──────┘ │
        └──────────┘    └──────────┘  └──────────┘
```

### Scaling Strategy

**Horizontal Scaling:**
- Add more VPS nodes to the registry
- Auto-balancer distributes new tenants
- Capacity planning: monitor CPU/memory per node

**Vertical Scaling:**
- Increase VPS instance size
- More containers per node (up to max_tenants limit)

**Load Balancing:**
- Round-robin distribution (default)
- Least-busy algorithm (future enhancement)

---

## 9. ClawDrop Wizard Integration

### What ClawDrop Adds

The ClawDrop wizard is an **alternate UI** for the same backend:

```
┌──────────────────────────────┐
│  ClawDrop Wizard             │
│  (Standalone HTML + React)   │
└──────────────┬───────────────┘
               │
    Calls same API endpoints:
    • POST /api/agents
    • GET /api/agents
    • WS /ws/provisioning/:id
               │
    ┌──────────▼──────────┐
    │ Storefront Bot API  │
    │ (same for Web App)  │
    └─────────────────────┘
```

**Key Differences:**

| Aspect | Web App | ClawDrop Wizard |
|--------|---------|-----------------|
| **Auth** | Telegram initData | Custom token or hardcoded |
| **Context** | Telegram user ID | API key or user context |
| **UI** | Telegram-optimized | Full desktop/mobile |
| **Purpose** | User management | Admin/demo deployment |
| **Deployment** | hfsp.cloud/app | Standalone server |

### ClawDrop Endpoint Integration

```
ClawDrop Server (Node.js / Python)
    │
    ├─ Static HTML + React assets
    ├─ Authentication (API key or JWT)
    ├─ Form validation
    └─ API calls:
        POST /api/agents (with Bearer token)
        GET  /api/agents (with Bearer token)
        WS   /ws/provisioning/:id
```

---

## 10. Error Handling & Resilience

### Provisioning Failures

**Retry Strategy:**
```
Attempt 1: Immediate retry
  ↓ (if fails)
Attempt 2: Wait 30 seconds, retry
  ↓ (if fails)
Attempt 3: Wait 60 seconds, retry
  ↓ (if fails)
Show error to user: "Provisioning failed. Manual retry available."
```

**Common Failure Scenarios:**

| Scenario | Root Cause | User Action |
|----------|-----------|-------------|
| "SSH connection timeout" | VPS offline or SSH port blocked | Retry or use different VPS |
| "Docker pull failed" | Registry access issue or rate limit | Retry in 5 minutes |
| "Container port conflict" | Port already in use | Manual cleanup or restart VPS |
| "Telegram token invalid" | User provided wrong token | Verify token in BotFather |
| "API key auth failed" | Wrong API key or provider down | Check key, verify provider status |

### WebSocket Reconnection

```
WebSocket disconnected
    │
    ├─ Attempt 1: Wait 1s, reconnect
    ├─ Attempt 2: Wait 2s, reconnect
    ├─ Attempt 3: Wait 4s, reconnect
    ├─ Attempt 4: Wait 8s, reconnect
    ├─ Attempt 5: Wait 16s, reconnect
    │
    └─ All failed: Show "Connection lost" message
         └─ User can manually refresh or close
```

---

## 11. Monitoring & Observability

### Metrics to Track

**Performance Metrics:**
- Provisioning time (target: <5 min)
- API response time (target: <500ms)
- WebSocket latency (target: <100ms)
- Web app load time (target: <2s)

**Reliability Metrics:**
- Provisioning success rate (target: >99%)
- API availability (target: 99.9%)
- VPS node uptime (target: >99.9%)

**Business Metrics:**
- Agents created (daily/monthly)
- Active agents
- User growth
- Error rates by type

### Logging Strategy

```typescript
// Structured logging format
{
  "timestamp": "2026-04-03T10:00:00Z",
  "level": "info",        // info, warn, error
  "service": "storefront-bot",
  "event": "provisioning_started",
  "tenant_id": "t_abc123",
  "user_id": 123456,
  "duration_ms": 150,
  "status": "success",    // success, error
  "error": null
}
```

---

## 12. Security Checklist

- [ ] All API endpoints require JWT authentication
- [ ] HMAC validation for Telegram initData (server-side only)
- [ ] API keys encrypted at rest (AES-256-GCM)
- [ ] SSH keys per-tenant, never reused
- [ ] Rate limiting on provisioning endpoint (max 5 per hour per user)
- [ ] CORS properly configured (allow only hfsp.cloud domains)
- [ ] No secrets in logs or error messages
- [ ] HTTPS enforced (HTTP redirects to HTTPS)
- [ ] Database backups automated
- [ ] Secrets rotation policy documented

---

## Summary

This architecture supports:
- ✅ **1000+ concurrent users** via stateless API design
- ✅ **Real-time provisioning feedback** via WebSocket
- ✅ **Multi-VPS scaling** via distributed registry
- ✅ **Secure secret management** via encryption at rest
- ✅ **Multiple UI options** (Web App + ClawDrop Wizard)
- ✅ **Production-ready monitoring** via structured logging

**Next Steps:**
1. Review this architecture with team
2. Create detailed API specifications
3. Design database migrations strategy
4. Plan deployment pipeline
5. Begin implementation (Frontend first for quick feedback)
