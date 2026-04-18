# HFSP Agent Provisioning - Database Schema Specification

**Version:** 1.0  
**Status:** Ready for Implementation  
**Database:** SQLite 3  
**Date:** April 3, 2026  

---

## 1. Database Overview

### 1.1 Design Principles

| Principle | Implementation |
|-----------|---|
| **Normalization** | Third normal form (3NF) |
| **Indexes** | Optimized for query patterns |
| **Constraints** | Foreign keys + unique constraints |
| **Auditing** | created_at + updated_at on main tables |
| **Encryption** | Secrets encrypted at rest |

### 1.2 Migrations Strategy

```typescript
// migrations/001-init.sql
// migrations/002-add-pairing-status.sql
// migrations/003-add-provisioning-logs.sql
// etc.

// schema version table
CREATE TABLE schema_version (
  version INTEGER PRIMARY KEY,
  name TEXT,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 2. Core Tables

### 2.1 users

Stores Telegram user information.

```sql
CREATE TABLE users (
  telegram_user_id INTEGER PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  username TEXT UNIQUE,
  
  -- Account info
  subscription_tier TEXT DEFAULT 'free',  -- free, pro, enterprise
  is_admin BOOLEAN DEFAULT FALSE,
  is_banned BOOLEAN DEFAULT FALSE,
  ban_reason TEXT,
  
  -- Quotas
  max_agents INTEGER DEFAULT 10,
  
  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_active DATETIME,
  
  CHECK (telegram_user_id > 0),
  CHECK (subscription_tier IN ('free', 'pro', 'enterprise'))
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_created_at ON users(created_at);
CREATE INDEX idx_users_is_admin ON users(is_admin) WHERE is_admin = TRUE;
```

**Constraints:**
- `telegram_user_id`: Primary key, immutable
- `username`: Unique per user (from Telegram)
- `max_agents`: Updated when tier changes

### 2.2 tenants (Agents)

Stores agent/tenant configurations.

```sql
CREATE TABLE tenants (
  tenant_id TEXT PRIMARY KEY,                    -- t_<random>
  telegram_user_id INTEGER NOT NULL,
  
  -- Agent Identity
  agent_name TEXT NOT NULL,                      -- User-facing name
  bot_token TEXT NOT NULL UNIQUE,               -- From BotFather
  bot_username TEXT NOT NULL,                   -- From BotFather
  bot_user_id INTEGER,                         -- Telegram ID of the bot
  
  -- Configuration
  template TEXT NOT NULL,                       -- blank, ops_starter
  provider TEXT NOT NULL,                       -- openai, anthropic, openrouter
  model TEXT NOT NULL,                         -- gpt-4, claude-3-opus, etc
  preset TEXT NOT NULL,                        -- fast, smart
  
  -- Secrets (encrypted)
  api_key_hash TEXT,                           -- Hash only, full key in api_secrets
  
  -- Deployment Info
  vps_id TEXT,                                 -- Which VPS node
  vps_ip TEXT,
  vps_ssh_port INTEGER DEFAULT 22,
  container_id TEXT,                           -- Docker container ID
  container_port INTEGER DEFAULT 8080,         -- Agent internal port
  
  -- Status Tracking
  status TEXT NOT NULL DEFAULT 'provisioning',
    -- pending_setup, provisioning, active, paused, failed, archived
  provisioning_error TEXT,
  provisioning_error_retryable BOOLEAN DEFAULT TRUE,
  
  pairing_status TEXT DEFAULT 'pending',        -- pending, paired, rejected, error
  pairing_code TEXT,                           -- 6-8 char code
  pairing_code_expires_at DATETIME,
  pairing_user_id INTEGER,                     -- Telegram ID of pairing user
  
  -- Metrics
  messages_handled INTEGER DEFAULT 0,
  errors_count INTEGER DEFAULT 0,
  last_error TEXT,
  
  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  provisioned_at DATETIME,
  last_interaction DATETIME,
  failed_at DATETIME,
  archived_at DATETIME,
  
  -- Foreign Key
  FOREIGN KEY (telegram_user_id) REFERENCES users(telegram_user_id),
  FOREIGN KEY (vps_id) REFERENCES vps_nodes(vps_id),
  
  -- Constraints
  UNIQUE(bot_token),
  UNIQUE(bot_user_id),
  CHECK (status IN ('pending_setup', 'provisioning', 'active', 'paused', 'failed', 'archived')),
  CHECK (pairing_status IN ('pending', 'paired', 'rejected', 'error')),
  CHECK (template IN ('blank', 'ops_starter')),
  CHECK (provider IN ('openai', 'anthropic', 'openrouter')),
  CHECK (preset IN ('fast', 'smart'))
);

-- Indexes for common queries
CREATE INDEX idx_tenants_user ON tenants(telegram_user_id);
CREATE INDEX idx_tenants_status ON tenants(status);
CREATE INDEX idx_tenants_created_at ON tenants(created_at DESC);
CREATE INDEX idx_tenants_last_interaction ON tenants(last_interaction DESC);
CREATE INDEX idx_tenants_bot_user_id ON tenants(bot_user_id);
CREATE INDEX idx_tenants_pairing_status ON tenants(pairing_status);
```

**Status Transitions:**
```
pending_setup
  → provisioning (when user confirms)
  ↓
provisioning
  → active (when setup completes)
  → failed (when error occurs)
  ↓
active
  → paused (user pauses)
  → failed (runtime error)
  → archived (user deletes)
  ↓
paused
  → active (user resumes)
  → archived (user deletes)
  ↓
failed
  → provisioning (user retries)
  → archived (user gives up)
  ↓
archived
  (final state - soft delete)
```

### 2.3 api_secrets

Stores encrypted API keys separately (separate table for better security).

```sql
CREATE TABLE api_secrets (
  secret_id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL UNIQUE,
  
  -- Encrypted data
  encrypted_api_key TEXT NOT NULL,              -- Encrypted with AES-256-GCM
  encryption_iv TEXT NOT NULL,                 -- Initialization vector
  encryption_tag TEXT,                         -- Authentication tag for GCM
  encryption_method TEXT DEFAULT 'aes-256-gcm',
  
  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  rotated_at DATETIME,
  
  FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id),
  
  -- Constraint to prevent accidental plaintext storage
  CHECK (length(encrypted_api_key) > 50)  -- Encrypted keys are long
);

CREATE INDEX idx_api_secrets_tenant ON api_secrets(tenant_id);
```

**Encryption Details:**
```typescript
// Example encryption/decryption
import crypto from 'crypto';

const ENCRYPTION_KEY = Buffer.from(process.env.DATA_ENCRYPTION_KEY, 'hex');

export function encryptApiKey(plaintext: string): {
  encrypted: string;
  iv: string;
  tag: string;
} {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const tag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    tag: tag.toString('hex')
  };
}

export function decryptApiKey(encrypted: string, iv: string, tag: string): string {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    ENCRYPTION_KEY,
    Buffer.from(iv, 'hex')
  );
  
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
```

### 2.4 vps_nodes

Registry of available VPS hosts for tenant deployment.

```sql
CREATE TABLE vps_nodes (
  vps_id TEXT PRIMARY KEY,                      -- vps_<random>
  
  -- Connection Info
  host TEXT NOT NULL UNIQUE,                    -- IP or hostname
  ssh_port INTEGER DEFAULT 22,
  ssh_username TEXT DEFAULT 'root',
  
  -- Capacity
  max_tenants INTEGER DEFAULT 100,
  current_tenants INTEGER DEFAULT 0,
  
  -- Configuration
  region TEXT,                                  -- us-east, eu-west, ap-south
  is_public BOOLEAN DEFAULT FALSE,
  
  -- Health Info
  status TEXT DEFAULT 'unknown',                -- healthy, degraded, offline, maintenance
  last_check DATETIME,
  consecutive_failures INTEGER DEFAULT 0,
  
  -- Stats
  uptime_percent REAL,
  cpu_usage_percent REAL,
  memory_usage_percent REAL,
  
  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  CHECK (status IN ('healthy', 'degraded', 'offline', 'maintenance')),
  CHECK (max_tenants > 0),
  CHECK (current_tenants >= 0 AND current_tenants <= max_tenants)
);

CREATE INDEX idx_vps_nodes_status ON vps_nodes(status);
CREATE INDEX idx_vps_nodes_region ON vps_nodes(region);
CREATE INDEX idx_vps_nodes_load ON vps_nodes(current_tenants / max_tenants);
```

**VPS Selection Algorithm:**
```typescript
// Select best VPS for new tenant
function selectVps(): VpsNode {
  // 1. Filter healthy VPS only
  const healthyVps = db.prepare(`
    SELECT * FROM vps_nodes
    WHERE status = 'healthy'
    AND current_tenants < max_tenants
    ORDER BY region, current_tenants ASC
    LIMIT 1
  `).all();
  
  // 2. Load balance by region preference + least-busy
  return healthyVps[0];
}
```

### 2.5 provisioning_logs

Detailed audit trail of provisioning operations.

```sql
CREATE TABLE provisioning_logs (
  log_id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  
  -- Event Info
  event_type TEXT NOT NULL,
    -- ssh_key_generated, ssh_key_installed, docker_image_pulled,
    -- container_created, container_started, container_healthy,
    -- agent_initialized, provisioning_complete, provisioning_failed,
    -- provisioning_retry, provisioning_cancelled
  severity TEXT DEFAULT 'info',                -- info, warning, error
  message TEXT NOT NULL,
  
  -- Details
  error_message TEXT,
  error_code TEXT,
  step_number INTEGER,
  total_steps INTEGER,
  duration_ms INTEGER,
  
  -- Context
  vps_id TEXT,
  container_id TEXT,
  
  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id),
  FOREIGN KEY (vps_id) REFERENCES vps_nodes(vps_id),
  
  CHECK (event_type IN (
    'ssh_key_generated', 'ssh_key_installed', 'docker_image_pulled',
    'container_created', 'container_started', 'container_healthy',
    'agent_initialized', 'provisioning_complete', 'provisioning_failed',
    'provisioning_retry', 'provisioning_cancelled'
  )),
  CHECK (severity IN ('info', 'warning', 'error'))
);

CREATE INDEX idx_provisioning_logs_tenant ON provisioning_logs(tenant_id);
CREATE INDEX idx_provisioning_logs_created_at ON provisioning_logs(created_at DESC);
CREATE INDEX idx_provisioning_logs_event ON provisioning_logs(event_type);
```

### 2.6 pairing_sessions

Tracks Telegram DM pairing flow.

```sql
CREATE TABLE pairing_sessions (
  session_id TEXT PRIMARY KEY,                  -- session_<random>
  tenant_id TEXT NOT NULL UNIQUE,
  
  -- User Info
  telegram_user_id INTEGER NOT NULL,            -- User attempting to pair
  pairing_code TEXT NOT NULL,                   -- 6-8 chars
  
  -- Validation
  is_valid BOOLEAN DEFAULT TRUE,
  validation_attempts INTEGER DEFAULT 0,
  last_attempted_at DATETIME,
  
  -- Status
  status TEXT DEFAULT 'pending',                -- pending, approved, rejected, expired
  approved_at DATETIME,
  
  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,                         -- Expires after 1 hour
  
  FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id),
  FOREIGN KEY (telegram_user_id) REFERENCES users(telegram_user_id),
  
  CHECK (status IN ('pending', 'approved', 'rejected', 'expired'))
);

CREATE INDEX idx_pairing_sessions_tenant ON pairing_sessions(tenant_id);
CREATE INDEX idx_pairing_sessions_code ON pairing_sessions(pairing_code);
CREATE INDEX idx_pairing_sessions_user ON pairing_sessions(telegram_user_id);
```

### 2.7 notifications

In-app notifications for users.

```sql
CREATE TABLE notifications (
  notification_id TEXT PRIMARY KEY,              -- notif_<random>
  telegram_user_id INTEGER NOT NULL,
  tenant_id TEXT,
  
  -- Notification Info
  type TEXT NOT NULL,
    -- provisioning_started, provisioning_complete, provisioning_failed,
    -- pairing_code_ready, agent_error, agent_paused, billing_alert
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  action_url TEXT,                             -- Deep link to action
  
  -- Status
  is_read BOOLEAN DEFAULT FALSE,
  read_at DATETIME,
  
  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME DEFAULT (datetime('now', '+30 days')),
  
  FOREIGN KEY (telegram_user_id) REFERENCES users(telegram_user_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id),
  
  CHECK (type IN (
    'provisioning_started', 'provisioning_complete', 'provisioning_failed',
    'pairing_code_ready', 'agent_error', 'agent_paused', 'billing_alert'
  ))
);

CREATE INDEX idx_notifications_user ON notifications(telegram_user_id, is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
```

### 2.8 audit_logs

Security audit trail.

```sql
CREATE TABLE audit_logs (
  audit_id TEXT PRIMARY KEY,
  telegram_user_id INTEGER,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  
  -- Request Context
  ip_address TEXT,
  user_agent TEXT,
  
  -- Response
  success BOOLEAN,
  status_code INTEGER,
  error_message TEXT,
  
  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (telegram_user_id) REFERENCES users(telegram_user_id),
  
  CHECK (success IN (0, 1))
);

CREATE INDEX idx_audit_logs_user ON audit_logs(telegram_user_id, created_at DESC);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
```

---

## 3. Views (Optional but Recommended)

### 3.1 user_agents_summary

```sql
CREATE VIEW user_agents_summary AS
SELECT
  u.telegram_user_id,
  COUNT(t.tenant_id) as total_agents,
  SUM(CASE WHEN t.status = 'active' THEN 1 ELSE 0 END) as active_agents,
  SUM(CASE WHEN t.status = 'provisioning' THEN 1 ELSE 0 END) as provisioning_agents,
  SUM(CASE WHEN t.status = 'failed' THEN 1 ELSE 0 END) as failed_agents,
  MAX(t.last_interaction) as last_interaction
FROM users u
LEFT JOIN tenants t ON u.telegram_user_id = t.telegram_user_id
GROUP BY u.telegram_user_id;
```

### 3.2 vps_node_utilization

```sql
CREATE VIEW vps_node_utilization AS
SELECT
  v.vps_id,
  v.host,
  v.max_tenants,
  v.current_tenants,
  ROUND(100.0 * v.current_tenants / v.max_tenants, 2) as utilization_percent,
  v.status
FROM vps_nodes v;
```

---

## 4. Data Integrity Constraints

### 4.1 Foreign Key Enforcement

```typescript
// Enable foreign keys (critical for SQLite)
db.pragma('foreign_keys = ON');
```

### 4.2 Cascading Deletes

**Define behavior for deletions:**

```sql
-- When user is deleted (soft delete), cascade to tenants
-- (Not implemented: users are never deleted, only archived)

-- When tenant is deleted, cascade to api_secrets
ALTER TABLE api_secrets
  DROP CONSTRAINT IF EXISTS fk_api_secrets_tenant,
  ADD CONSTRAINT fk_api_secrets_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
    ON DELETE CASCADE;
```

---

## 5. Queries (Performance Optimization)

### 5.1 Common Query Patterns

**Get all agents for user (with status):**
```sql
SELECT t.*, COUNT(pl.log_id) as log_count
FROM tenants t
LEFT JOIN provisioning_logs pl ON t.tenant_id = pl.tenant_id
WHERE t.telegram_user_id = ?
GROUP BY t.tenant_id
ORDER BY t.created_at DESC;
```

**Get provisioning status:**
```sql
SELECT
  t.tenant_id,
  t.status,
  t.pairing_status,
  MAX(pl.created_at) as last_event,
  pl.message
FROM tenants t
LEFT JOIN provisioning_logs pl ON t.tenant_id = pl.tenant_id
WHERE t.tenant_id = ?
ORDER BY pl.created_at DESC
LIMIT 1;
```

**Get VPS capacity:**
```sql
SELECT
  vps_id,
  host,
  max_tenants,
  current_tenants,
  (max_tenants - current_tenants) as available_slots,
  ROUND(100.0 * current_tenants / max_tenants, 2) as utilization_percent
FROM vps_nodes
WHERE status = 'healthy'
ORDER BY current_tenants ASC;
```

---

## 6. Backup & Recovery Strategy

### 6.1 Backup Schedule

```bash
# Daily backup
0 2 * * * sqlite3 /data/hfsp.db ".backup /backups/hfsp-$(date +\%Y\%m\%d-\%H\%M\%S).db"

# Keep last 30 days
0 3 * * * find /backups -name "hfsp-*.db" -mtime +30 -delete
```

### 6.2 VACUUM & OPTIMIZE

```sql
-- Regular maintenance
PRAGMA optimize;
VACUUM;
```

---

## 7. Migration Example

### Initial Schema (Version 1)

```typescript
// migrations/001-init.ts
export async function up(db: Database) {
  // Create all base tables
  db.exec(`
    CREATE TABLE users (...);
    CREATE TABLE tenants (...);
    CREATE TABLE api_secrets (...);
    CREATE TABLE vps_nodes (...);
    CREATE TABLE provisioning_logs (...);
    CREATE TABLE pairing_sessions (...);
    CREATE TABLE notifications (...);
    CREATE TABLE audit_logs (...);
    
    -- Insert schema version
    INSERT INTO schema_version (version, name) VALUES (1, 'Initial schema');
  `);
}

export async function down(db: Database) {
  db.exec(`
    DROP TABLE audit_logs;
    DROP TABLE notifications;
    DROP TABLE pairing_sessions;
    DROP TABLE provisioning_logs;
    DROP TABLE api_secrets;
    DROP TABLE vps_nodes;
    DROP TABLE tenants;
    DROP TABLE users;
  `);
}
```

---

## 8. Implementation Checklist

- [ ] Create all tables with indexes
- [ ] Set up foreign key constraints
- [ ] Create views for common queries
- [ ] Implement migration system
- [ ] Add audit logging hooks
- [ ] Set up backup strategy
- [ ] Configure PRAGMA settings for SQLite
- [ ] Add query performance monitoring
- [ ] Document schema changes
- [ ] Create database initialization script

---

## Summary

This schema provides:
- ✅ Normalized data structure
- ✅ Proper indexing for performance
- ✅ Security (encrypted secrets)
- ✅ Audit trails
- ✅ Status tracking & state machine
- ✅ Scalable design

**Next Steps:**
1. Create migration files
2. Set up database initialization
3. Implement encryption/decryption logic
4. Add query helpers
5. Set up monitoring
