# HFSP Agent Provisioning - Backend API Specifications

**Version:** 1.0  
**Status:** Implementation Ready  
**Date:** April 3, 2026  
**Focus:** REST API + WebSocket endpoints  

---

## 1. API Overview

### 1.1 Base URL & Versioning

```
Production: https://hfsp.cloud/api/v1
Development: http://localhost:3000/api/v1
WebSocket: wss://hfsp.cloud/ws (prod), ws://localhost:3000/ws (dev)
```

### 1.2 Authentication

**All endpoints (except `/auth`) require:**
```
Authorization: Bearer {JWT_TOKEN}
```

**Header Format:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 2. Authentication Endpoints

### POST /api/v1/auth/webapp-auth

**Purpose:** Validate Telegram Web App signature and generate JWT  
**Auth:** No (public)

**Request:**
```typescript
{
  initData: string;  // window.Telegram.WebApp.initData
}
```

**Example:**
```json
{
  "initData": "user=%7B%22id%22%3A123456789%2C%22first_name%22%3A%22John%22%7D&hash=ABC123"
}
```

**Validation Steps:**
```typescript
// 1. Extract hash from initData
const hash = new URLSearchParams(initData).get('hash');
const dataCheckString = initData
  .split('&')
  .filter(p => !p.startsWith('hash='))
  .sort()
  .join('\n');

// 2. Calculate HMAC-SHA256
const secret = crypto.createHmac('sha256', 'WebAppData')
  .update(BOT_TOKEN)
  .digest();
const calculatedHash = crypto.createHmac('sha256', secret)
  .update(dataCheckString)
  .digest('hex');

// 3. Compare hashes
if (hash !== calculatedHash) {
  throw new Error('Invalid signature');
}

// 4. Check timestamp (must be < 1 hour old)
const initDataUnsafe = Object.fromEntries(new URLSearchParams(initData));
const authDate = parseInt(initDataUnsafe.auth_date) * 1000;
if (Date.now() - authDate > 3600000) {
  throw new Error('initData expired');
}
```

**Response (200 OK):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600,
  "user": {
    "telegramUserId": 123456789,
    "firstName": "John",
    "lastName": "Doe",
    "username": "johndoe",
    "isPremium": false
  }
}
```

**Error Responses:**
```json
{
  "code": "INVALID_SIGNATURE",
  "message": "Invalid Telegram Web App signature"
}

{
  "code": "EXPIRED_INITDATA",
  "message": "initData has expired (max 1 hour old)"
}

{
  "code": "MISSING_FIELDS",
  "message": "Missing required fields in initData"
}
```

### POST /api/v1/auth/refresh

**Purpose:** Refresh expired JWT token  
**Auth:** Yes (Bearer token)

**Request:**
```json
{
  "refreshToken": "optional_refresh_token"
}
```

**Response (200 OK):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600
}
```

**Error (401 Unauthorized):**
```json
{
  "code": "TOKEN_EXPIRED",
  "message": "Token has expired and cannot be refreshed"
}
```

---

## 3. Agent Management Endpoints

### GET /api/v1/agents

**Purpose:** List all agents for authenticated user  
**Auth:** Yes  
**Query Parameters:**
```
?status=all|active|provisioning|failed|archived
?search=query_string
?skip=0
?limit=50
?sortBy=created_at|name|last_interaction
?sortOrder=asc|desc
```

**Response (200 OK):**
```json
{
  "agents": [
    {
      "tenantId": "t_abc123def456",
      "agentName": "Trading Bot",
      "botUsername": "my_trading_bot",
      "botToken": "123456:ABCDEF...",
      "provider": "anthropic",
      "model": "claude-3-sonnet-20240229",
      "template": "blank",
      "preset": "smart",
      "status": "active",
      "pairingStatus": "paired",
      "containerStatus": "running",
      "containerPort": 8080,
      "vpsId": "vps_node_1",
      "createdAt": "2026-04-03T10:00:00Z",
      "provisioned_at": "2026-04-03T10:15:00Z",
      "lastInteraction": "2026-04-03T12:30:00Z",
      "errorMessage": null,
      "telegramUserId": 123456789
    }
  ],
  "total": 42,
  "hasMore": true
}
```

### GET /api/v1/agents/:tenantId

**Purpose:** Get details for a single agent  
**Auth:** Yes  
**Authorization:** User must own this agent

**Response (200 OK):**
```json
{
  "tenantId": "t_abc123",
  "agentName": "Trading Bot",
  "botUsername": "my_trading_bot",
  "provider": "anthropic",
  "model": "claude-3-sonnet-20240229",
  "template": "blank",
  "preset": "smart",
  "status": "active",
  "pairingStatus": "paired",
  "containerStatus": "running",
  "vpsId": "vps_node_1",
  "vpsIp": "192.168.1.100",
  "vpsSSHPort": 22,
  "containerId": "abc123def456...",
  "createdAt": "2026-04-03T10:00:00Z",
  "provisioned_at": "2026-04-03T10:15:00Z",
  "lastInteraction": "2026-04-03T12:30:00Z",
  "errorMessage": null,
  "pairingCode": "A52X7ABQ",
  "stats": {
    "messagesHandled": 2456,
    "errors": 3,
    "uptime": "99.8%"
  },
  "dashboardAccess": {
    "sshCommand": "ssh -p 2222 admin@192.168.1.100",
    "webDashboard": "http://192.168.1.100:8080/dashboard"
  }
}
```

### POST /api/v1/agents

**Purpose:** Create new agent (start provisioning)  
**Auth:** Yes  
**Rate Limit:** 5 per hour per user  

**Request:**
```json
{
  "agentName": "Trading Bot",
  "botToken": "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcde",
  "botUsername": "my_trading_bot",
  "template": "blank",
  "provider": "anthropic",
  "apiKey": "sk-ant-v1-...",
  "preset": "smart",
  "vpsId": "auto"
}
```

**Validation:**
- [ ] agentName: 1-60 chars, alphanumeric + spaces/dash/underscore
- [ ] botToken: Matches format `\d+:[A-Za-z0-9_-]+`
- [ ] botUsername: 5-32 chars, alphanumeric + underscore only
- [ ] provider: One of [openai, anthropic, openrouter]
- [ ] apiKey: Min 20 chars, max 500 chars
- [ ] User has not exceeded quota (e.g., max 10 agents)

**Response (201 Created):**
```json
{
  "tenantId": "t_new123abc",
  "agentName": "Trading Bot",
  "status": "provisioning",
  "pairingStatus": "pending",
  "createdAt": "2026-04-03T13:00:00Z",
  "message": "Agent provisioning started. Check status in real-time."
}
```

**Async Behavior:**
```
1. API returns 201 immediately
2. Provisioning happens in background
3. WebSocket sends real-time updates
4. Database status changes: provisioning → active
5. User can see progress via WebSocket /ws/provisioning/:tenantId
```

**Error (400 Bad Request):**
```json
{
  "code": "INVALID_BOT_TOKEN",
  "message": "Bot token must match format 123456:ABCDEF..."
}
```

**Error (429 Too Many Requests):**
```json
{
  "code": "RATE_LIMITED",
  "message": "Max 5 agents per hour. Try again in 23 minutes."
}
```

### PUT /api/v1/agents/:tenantId

**Purpose:** Update agent configuration  
**Auth:** Yes  
**Fields that can be updated:**
- agentName
- preset (if not provisioning)

**Request:**
```json
{
  "agentName": "Updated Bot Name",
  "preset": "fast"
}
```

**Response (200 OK):**
```json
{
  "tenantId": "t_abc123",
  "agentName": "Updated Bot Name",
  "preset": "fast",
  "message": "Agent updated successfully"
}
```

**Error (400 Bad Request):**
```json
{
  "code": "CANNOT_UPDATE_PROVISIONING",
  "message": "Cannot update agent while provisioning. Wait for completion."
}
```

### DELETE /api/v1/agents/:tenantId

**Purpose:** Delete/archive agent  
**Auth:** Yes  
**Behavior:** Soft delete (marks as archived)

**Query Parameters:**
```
?hard=false  (default - soft delete, keeps logs)
?hard=true   (hard delete - removes everything)
```

**Response (200 OK):**
```json
{
  "tenantId": "t_abc123",
  "status": "archived",
  "message": "Agent archived successfully"
}
```

**Error (409 Conflict):**
```json
{
  "code": "CANNOT_DELETE_PROVISIONING",
  "message": "Cannot delete agent during provisioning. Cancel first."
}
```

### POST /api/v1/agents/:tenantId/pause

**Purpose:** Pause agent (stop receiving messages)  
**Auth:** Yes  
**Preconditions:** status must be "active"

**Response (200 OK):**
```json
{
  "tenantId": "t_abc123",
  "status": "paused",
  "message": "Agent paused. Will not receive messages."
}
```

### POST /api/v1/agents/:tenantId/resume

**Purpose:** Resume agent  
**Auth:** Yes  
**Preconditions:** status must be "paused"

**Response (200 OK):**
```json
{
  "tenantId": "t_abc123",
  "status": "active",
  "message": "Agent resumed. Ready to receive messages."
}
```

### GET /api/v1/agents/:tenantId/logs

**Purpose:** Get agent logs (last 100 lines)  
**Auth:** Yes  

**Query Parameters:**
```
?lines=100
?filter=error|warning|info|debug
?since=2026-04-03T10:00:00Z
```

**Response (200 OK):**
```json
{
  "tenantId": "t_abc123",
  "logs": [
    {
      "timestamp": "2026-04-03T13:45:23.123Z",
      "level": "info",
      "service": "openclaw",
      "message": "Agent started successfully",
      "metadata": {}
    },
    {
      "timestamp": "2026-04-03T13:45:25.456Z",
      "level": "error",
      "service": "api-client",
      "message": "Failed to call OpenAI API",
      "metadata": {
        "error": "401 Unauthorized",
        "endpoint": "/completions"
      }
    }
  ],
  "total": 1250,
  "hasMore": true
}
```

---

## 4. Provisioning Endpoints

### GET /api/v1/provisioning/:tenantId/status

**Purpose:** Get current provisioning status  
**Auth:** Yes  

**Response (200 OK):**
```json
{
  "tenantId": "t_abc123",
  "status": "provisioning",
  "currentStep": 2,
  "totalSteps": 4,
  "progress": 0.5,
  "message": "Docker container starting...",
  "error": null,
  "estimatedSecondsRemaining": 45,
  "events": [
    {
      "event": "provisioning_started",
      "timestamp": "2026-04-03T13:00:00Z",
      "message": "Started provisioning agent"
    },
    {
      "event": "ssh_key_installed",
      "timestamp": "2026-04-03T13:00:15Z",
      "message": "SSH key configured on VPS"
    },
    {
      "event": "container_starting",
      "timestamp": "2026-04-03T13:00:30Z",
      "message": "Docker container starting..."
    }
  ]
}
```

### POST /api/v1/provisioning/:tenantId/retry

**Purpose:** Retry failed provisioning  
**Auth:** Yes  
**Preconditions:** status must be "failed"

**Response (200 OK):**
```json
{
  "tenantId": "t_abc123",
  "status": "provisioning",
  "message": "Provisioning retry started"
}
```

### WS /ws/provisioning/:tenantId

**Purpose:** Real-time provisioning status stream  
**Auth:** Yes (Bearer token in query or header)  
**Connection URL:**
```
wss://hfsp.cloud/ws/provisioning/t_abc123?token=eyJ0eXAiOi...
or
ws://localhost:3000/ws/provisioning/t_abc123
(with Authorization header)
```

**Message Format (Server → Client):**
```json
{
  "event": "provisioning_started",
  "tenantId": "t_abc123",
  "timestamp": "2026-04-03T13:00:00Z",
  "data": {
    "message": "Starting provisioning process"
  }
}

{
  "event": "ssh_key_installed",
  "tenantId": "t_abc123",
  "timestamp": "2026-04-03T13:00:15Z",
  "data": {
    "step": 1,
    "totalSteps": 4,
    "message": "SSH key configured"
  }
}

{
  "event": "container_started",
  "tenantId": "t_abc123",
  "timestamp": "2026-04-03T13:00:30Z",
  "data": {
    "step": 2,
    "totalSteps": 4,
    "containerId": "abc123def456",
    "message": "Docker container running"
  }
}

{
  "event": "agent_initialized",
  "tenantId": "t_abc123",
  "timestamp": "2026-04-03T13:00:45Z",
  "data": {
    "step": 3,
    "totalSteps": 4,
    "pairingCode": "A52X7ABQ",
    "message": "Agent ready. Get pairing code from bot."
  }
}

{
  "event": "provisioning_complete",
  "tenantId": "t_abc123",
  "timestamp": "2026-04-03T13:01:00Z",
  "data": {
    "step": 4,
    "totalSteps": 4,
    "agentId": "t_abc123",
    "message": "Agent ready for use"
  }
}

{
  "event": "provisioning_failed",
  "tenantId": "t_abc123",
  "timestamp": "2026-04-03T13:02:00Z",
  "data": {
    "error": "SSH connection timeout",
    "retryable": true,
    "message": "Failed to connect to VPS. Check network settings."
  }
}
```

**Client Lifecycle:**
```
1. Client connects to WS
2. Server validates JWT and tenant ownership
3. Server checks current status
4. Server sends current progress (if provisioning in progress)
5. Server streams new events as they occur
6. On error: connection closed with code 4000-4999
7. Client should implement auto-reconnect
```

**Error Codes:**
```
1000 - Normal closure
4001 - Unauthorized (invalid token)
4002 - Not found (tenant doesn't exist)
4003 - Forbidden (user doesn't own tenant)
4004 - Conflict (provisioning not in progress)
4500 - Server error
```

---

## 5. Admin Endpoints

**These endpoints require `role: admin` in JWT**

### GET /api/v1/admin/vps

**Purpose:** List all VPS nodes  
**Auth:** Yes (admin only)

**Response:**
```json
{
  "nodes": [
    {
      "vpsId": "vps_node_1",
      "host": "192.168.1.100",
      "sshPort": 22,
      "sshUsername": "root",
      "maxTenants": 100,
      "currentTenants": 45,
      "availableSlots": 55,
      "status": "healthy",
      "region": "us-east-1",
      "lastCheck": "2026-04-03T13:50:00Z",
      "uptime": "99.9%",
      "cpuUsage": 0.42,
      "memoryUsage": 0.68
    }
  ]
}
```

### POST /api/v1/admin/vps

**Purpose:** Register new VPS node  
**Auth:** Yes (admin only)

**Request:**
```json
{
  "host": "192.168.1.200",
  "sshPort": 22,
  "sshUsername": "root",
  "maxTenants": 100,
  "region": "eu-west-1"
}
```

**Response (201 Created):**
```json
{
  "vpsId": "vps_node_2",
  "host": "192.168.1.200",
  "status": "pending_verification",
  "message": "VPS registered. Health check will run in 30 seconds."
}
```

### GET /api/v1/admin/stats

**Purpose:** System statistics  
**Auth:** Yes (admin only)

**Response:**
```json
{
  "users": {
    "total": 523,
    "activeThisMonth": 312,
    "newThisMonth": 45
  },
  "agents": {
    "total": 1250,
    "active": 892,
    "provisioning": 23,
    "failed": 15,
    "archived": 320
  },
  "vps": {
    "totalNodes": 3,
    "healthyNodes": 3,
    "totalTenantSlots": 300,
    "usedSlots": 138
  },
  "provisioning": {
    "successRate": 0.972,
    "avgDuration": 87,
    "failureReasons": {
      "ssh_timeout": 8,
      "docker_error": 4,
      "invalid_token": 2,
      "other": 1
    }
  }
}
```

---

## 6. Error Response Format

**Consistent error response across all endpoints:**

```json
{
  "code": "ERROR_CODE",
  "message": "Human-readable error message",
  "details": {
    "field": "value",
    "path": "/api/v1/agents"
  },
  "requestId": "req_123abc",
  "timestamp": "2026-04-03T13:45:00Z"
}
```

**Common HTTP Status Codes:**

| Code | Scenario |
|------|----------|
| 200 | Successful request |
| 201 | Resource created |
| 204 | Successful deletion |
| 400 | Bad request (validation error) |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not found |
| 409 | Conflict (invalid state transition) |
| 429 | Rate limited |
| 500 | Server error |
| 503 | Service unavailable |

---

## 7. Rate Limiting

**Global Rate Limits:**

| Endpoint | Limit | Window |
|----------|-------|--------|
| POST /agents | 5 | 1 hour |
| GET /agents | 100 | 1 minute |
| WebSocket | 1 connection | per tenant |
| Auth endpoints | 10 | 1 minute |

**Rate Limit Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1680520000
```

**429 Response:**
```json
{
  "code": "RATE_LIMITED",
  "message": "Too many requests. Try again in 45 seconds.",
  "retryAfter": 45
}
```

---

## 8. Pagination

**Standard pagination format:**

**Request:**
```
GET /api/v1/agents?skip=0&limit=20
```

**Response:**
```json
{
  "data": [...],
  "pagination": {
    "skip": 0,
    "limit": 20,
    "total": 523,
    "hasMore": true,
    "pageCount": 27
  }
}
```

---

## 9. Implementation Checklist

- [ ] JWT token generation & validation
- [ ] HMAC-SHA256 validation for Telegram initData
- [ ] All endpoints return consistent error format
- [ ] Rate limiting middleware
- [ ] CORS configuration
- [ ] Request/response logging
- [ ] Database transaction handling
- [ ] Graceful WebSocket disconnection
- [ ] Auto-reconnect guidance for clients
- [ ] API documentation (OpenAPI/Swagger)
- [ ] Version API endpoints (/api/v1/)
- [ ] Health check endpoint (/health)
- [ ] Metrics endpoint (/metrics)

---

## Summary

This specification provides:
- ✅ Complete REST API endpoints
- ✅ WebSocket real-time updates
- ✅ Authentication flow
- ✅ Error handling standards
- ✅ Rate limiting strategy
- ✅ Admin operations
- ✅ Request/response examples
- ✅ Implementation checklist

**Next Steps:**
1. Implement authentication endpoints first
2. Create database migrations
3. Build provisioning logic
4. Implement WebSocket server
5. Add monitoring/logging
