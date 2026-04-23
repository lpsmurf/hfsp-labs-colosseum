# Detailed Testing Guide - Telegram Bridge Integration

---

## OPTION 1: LOCAL INTEGRATION TESTING

**Time:** 30 minutes  
**Prerequisites:** Node.js 20+, npm, both services installed  
**What We're Testing:** Services run locally on your Mac, communicate via localhost

### Why Test Locally?

✅ Fast iteration  
✅ Easy to debug individual services  
✅ Direct logs without Docker complexity  
✅ Can modify code and hot-reload  

---

## OPTION 1 DETAILED WALKTHROUGH

### Step 1: Terminal Setup (2 min)

You need **3 terminal windows** side by side:

```
┌──────────────────┬──────────────────┬──────────────────┐
│   Terminal 1     │   Terminal 2     │   Terminal 3     │
│  Agent Brain     │  Telegram Bot    │  Test Commands   │
│  (port 3334)     │  (port 3335)     │  (curl, checks)  │
└──────────────────┴──────────────────┴──────────────────┘
```

**In Terminal 1: Navigate to agent-brain**

```bash
cd /Users/mac/Projects/hfsp-labs-colosseum-dev/packages/agent-provisioning/services/agent-brain
```

**In Terminal 2: Navigate to telegram-bot**

```bash
cd /Users/mac/Projects/hfsp-labs-colosseum-dev/packages/agent-provisioning/services/telegram-bot
```

**Terminal 3: Keep for testing**

```bash
cd /Users/mac/Projects/hfsp-labs-colosseum-dev
```

---

### Step 2: Start Agent Brain (Terminal 1)

**In Terminal 1, run:**

```bash
npm run dev
```

**You should see:**

```
✓ Poli Agent initialized
✓ Server running on port 3334
  GET /manifest — view system prompt
  GET /status — check agent status
  POST /initialize — initialize agent
  POST /message — send user message
```

**✅ Check 1:** If you see this, Agent Brain is ready!

---

### Step 3: Start Telegram Bot (Terminal 2)

**In Terminal 2, run:**

```bash
npm run dev
```

**You should see:**

```
✓ Server running on port 3335
  POST /webhook — receive Telegram updates
  GET /health — check server status
```

**✅ Check 2:** If you see this, Telegram Bot is ready!

---

### Step 4: Test Service Health (Terminal 3)

Now we test if both services are accessible and healthy.

**Test 1: Agent Brain Health**

```bash
curl http://localhost:3334/health
```

**Expected response:**

```json
{"status":"ok","timestamp":"2026-04-22T14:55:00.000Z"}
```

**What it means:**
- ✅ Agent Brain is running
- ✅ Port 3334 is accessible
- ✅ Health check endpoint works

**If you get an error:**
```
curl: (7) Failed to connect to localhost port 3334
```
→ Agent Brain didn't start, check Terminal 1 for errors

---

**Test 2: Telegram Bot Health**

```bash
curl http://localhost:3335/health
```

**Expected response:**

```json
{"status":"healthy","service":"telegram-bot","timestamp":"2026-04-22T14:55:01.000Z"}
```

**What it means:**
- ✅ Telegram Bot is running
- ✅ Port 3335 is accessible
- ✅ Health check endpoint works

**If you get an error:**
```
curl: (7) Failed to connect to localhost port 3335
```
→ Telegram Bot didn't start, check Terminal 2 for errors

---

### Step 5: Test Webhook Endpoint (Terminal 3)

Now test the core functionality - can we send a message through the webhook?

**Test 3: Invalid Signature (should be rejected)**

```bash
curl -X POST http://localhost:3335/webhook \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: wrong-token" \
  -d '{"update_id": 1, "message": {"message_id": 1, "chat": {"id": 123}, "from": {"id": 456}, "text": "Hello"}}'
```

**Expected response:**

```json
{"error":"Unauthorized"}
```

**HTTP Status:** `401`

**What it means:**
- ✅ Signature validation is working
- ✅ Rejects invalid tokens correctly
- ✅ Security is in place

**If it returns 200 (OK):**
→ Signature validation isn't working properly

---

**Test 4: Valid Message (no signature, localhost allows it)**

```bash
curl -X POST http://localhost:3335/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "update_id": 1,
    "message": {
      "message_id": 1,
      "chat": {"id": 123, "type": "private"},
      "from": {"id": 456, "first_name": "Test"},
      "text": "Hello agent, book me a flight"
    }
  }'
```

**Expected response:**

```json
{"ok":true}
```

**HTTP Status:** `200`

**What it means:**
- ✅ Webhook received the message
- ✅ Message was parsed correctly
- ✅ Response was sent back to Telegram

**Check Terminal 2 (Telegram Bot logs):**

You should see:

```
[timestamp] ℹ️ Webhook received
[timestamp] ℹ️ Processing user message
  userId: 456
  text: Hello agent, book me a flight
[timestamp] ℹ️ Agent responded
[timestamp] ℹ️ Response sent to user
```

**This means:**
- ✅ Message was parsed (user_id, text extracted)
- ✅ Agent was called
- ✅ Response was sent

---

### Step 6: Test Agent-Brain Integration (Terminal 3)

Now test if Telegram Bot can actually call Agent Brain.

**Test 5: Direct Agent Brain Call**

```bash
curl -X POST http://localhost:3334/message \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "telegram:456",
    "message": "Book me a flight to Miami"
  }'
```

**Expected response:**

```json
{
  "response": "Hello! I'm Poli Agent. You said: \"Book me a flight to Miami\". I'm ready to help...",
  "requiresApproval": false
}
```

**What it means:**
- ✅ Agent Brain `/message` endpoint works
- ✅ Accepts properly formatted requests
- ✅ Returns response with optional approval field

**Check Terminal 1 (Agent Brain logs):**

You should see:

```
[timestamp] ℹ️ Message processed
  user_id: telegram:456
  message: Book me a flight...
```

---

### Step 7: Full Integration Flow Test (Terminal 3)

Now test the complete flow: Webhook → Message Parsing → Agent Call → Response

**Test 6: Complete Message Flow**

```bash
curl -X POST http://localhost:3335/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "update_id": 2,
    "message": {
      "message_id": 2,
      "chat": {"id": 789, "type": "private"},
      "from": {"id": 111, "first_name": "TestUser"},
      "text": "What are todays trading signals?"
    }
  }'
```

**Expected response:**

```json
{"ok":true}
```

**Check logs in BOTH terminals:**

**Terminal 2 (Telegram Bot):**
```
[timestamp] ℹ️ Webhook received
  updateId: 2
[timestamp] ℹ️ Processing user message
  userId: 111
  chatId: 789
  text: What are todays trading signals?
[timestamp] ℹ️ Calling agent-brain
[timestamp] ℹ️ Agent responded
  response: Hello! I'm Poli Agent...
[timestamp] ℹ️ Response sent to user
```

**Terminal 1 (Agent Brain):**
```
[timestamp] ℹ️ Message processed
  user_id: telegram:111
  message: What are todays trading signals?
```

**What this means:**
- ✅ Webhook received message
- ✅ Extracted user_id (111), chat_id (789), text correctly
- ✅ Telegram Bot called Agent Brain
- ✅ Agent Brain processed the message
- ✅ Response came back
- ✅ All services working together

---

### Step 8: Test Error Handling (Terminal 3)

**Test 7: Stop Agent Brain and send a message**

1. In Terminal 1, press **Ctrl+C** to stop Agent Brain
2. Wait 2 seconds
3. In Terminal 3, run:

```bash
curl -X POST http://localhost:3335/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "update_id": 3,
    "message": {
      "message_id": 3,
      "chat": {"id": 789, "type": "private"},
      "from": {"id": 111, "first_name": "TestUser"},
      "text": "Hello"
    }
  }'
```

**Expected response:**

```json
{"ok":true}
```

**Check Terminal 2 logs:**

```
[timestamp] ℹ️ Webhook received
[timestamp] ❌ Error calling agent-brain
  error: connect ECONNREFUSED
[timestamp] ℹ️ Sending fallback message to user
```

**What it means:**
- ✅ Error handling works
- ✅ Gracefully handles Agent Brain being down
- ✅ Sends user-friendly error message instead of crashing

**Restart Agent Brain:**
```bash
npm run dev
```

---

### Step 9: Summary - Local Testing Checklist

Mark off as you complete each test:

```
✅ Test 1: Agent Brain health check (curl /health)
✅ Test 2: Telegram Bot health check (curl /health)
✅ Test 3: Invalid signature rejected (401 response)
✅ Test 4: Valid message accepted (200 response)
✅ Test 5: Message appears in logs
✅ Test 6: Agent Brain responds to /message call
✅ Test 7: Complete flow works (webhook → agent → response)
✅ Test 8: Error handling when Agent Brain is down
```

**If all checks pass:** ✅ Local integration testing is complete!

---

---

## OPTION 2: DOCKER INTEGRATION TESTING

**Time:** 20 minutes  
**Prerequisites:** Docker, docker-compose  
**What We're Testing:** Services in containers, like production

### Why Test with Docker?

✅ Tests production environment exactly  
✅ Services isolated in containers  
✅ Network configuration like prod  
✅ Validates Dockerfile is correct  

---

## OPTION 2 DETAILED WALKTHROUGH

### Step 1: Terminal Setup (1 min)

You need **2 terminal windows**:

```
┌──────────────────┬──────────────────┐
│   Terminal 1     │   Terminal 2     │
│  Docker Compose  │  Test Commands   │
│  (logs)          │  (curl, checks)  │
└──────────────────┴──────────────────┘
```

**In Terminal 1: Navigate to telegram-bot**

```bash
cd /Users/mac/Projects/hfsp-labs-colosseum-dev/packages/agent-provisioning/services/telegram-bot
```

**In Terminal 2: Same location**

```bash
cd /Users/mac/Projects/hfsp-labs-colosseum-dev/packages/agent-provisioning/services/telegram-bot
```

---

### Step 2: Build Docker Images (Terminal 1)

**In Terminal 1, run:**

```bash
docker-compose build
```

**What you'll see:**

```
Building agent-brain
[+] Building 45.2s (12/12) FINISHED
 => [agent-brain internal] load build context                          0.2s
 => [agent-brain] FROM node:20-alpine                                   8.5s
 => [agent-brain] COPY package*.json ./                                 0.1s
 => [agent-brain] RUN npm install                                      12.3s
 => [agent-brain] COPY tsconfig.json ./                                 0.1s
 => [agent-brain] COPY src ./src                                        0.2s
 => [agent-brain] RUN npm run build                                     3.2s
 => exporting to image                                                  2.1s

Building telegram-bot
[+] Building 52.1s (12/12) FINISHED
 => [telegram-bot internal] load build context                         0.2s
 => [telegram-bot] FROM node:20-alpine                                  9.1s
 => [telegram-bot] COPY package*.json ./                                0.1s
 => [telegram-bot] RUN npm install                                     14.2s
 => [telegram-bot] COPY tsconfig.json ./                                0.1s
 => [telegram-bot] COPY src ./src                                       0.2s
 => [telegram-bot] RUN npm run build                                    4.1s
 => exporting to image                                                  2.2s
```

**What it means:**
- ✅ Both Docker images built successfully
- ✅ Node 20-alpine installed
- ✅ Dependencies installed
- ✅ TypeScript compiled
- ✅ Ready to run

**If you see errors:**
```
error: npm ERR! code EINVALID
```
→ Check `npm install` in the building service, dependencies might be wrong

---

### Step 3: Start Services with Docker Compose (Terminal 1)

**In Terminal 1, run:**

```bash
docker-compose up
```

**What you'll see:**

```
[+] Running 2/2
 ✔ Network hfsp-network Created                           0.1s
 ✔ hfsp-agent-brain Created                               0.2s
 ✔ hfsp-telegram-bot Created                              0.2s

hfsp-agent-brain    | ✓ Poli Agent initialized
hfsp-agent-brain    | ✓ Server running on port 3334
hfsp-agent-brain    |   POST /message — send user message
hfsp-agent-brain    |   GET /health — check agent status
hfsp-telegram-bot   | ✓ Server running on port 3335
hfsp-telegram-bot   |   POST /webhook — receive Telegram updates
hfsp-telegram-bot   |   GET /health — check server status
```

**What it means:**
- ✅ Network `hfsp-network` created (containers can communicate)
- ✅ Agent Brain container started on port 3334
- ✅ Telegram Bot container started on port 3335
- ✅ Both services are running inside Docker

**✅ Check 1:** If you see both startup messages, services are ready!

**Important:** Keep this terminal open! It shows the logs from both services.

---

### Step 4: Test Service Health (Terminal 2)

**Test 1: Agent Brain Health**

```bash
curl http://localhost:3334/health
```

**Expected response:**

```json
{"status":"ok","timestamp":"2026-04-22T14:55:00.000Z"}
```

**What it means:**
- ✅ Agent Brain container is accessible from host
- ✅ Port mapping 3334 works
- ✅ Service is healthy

**If you get connection refused:**
```
curl: (7) Failed to connect to localhost port 3334
```
→ Containers aren't started yet, wait 5 seconds and try again

---

**Test 2: Telegram Bot Health**

```bash
curl http://localhost:3335/health
```

**Expected response:**

```json
{"status":"healthy","service":"telegram-bot","timestamp":"2026-04-22T14:55:01.000Z"}
```

**What it means:**
- ✅ Telegram Bot container is accessible
- ✅ Port mapping 3335 works
- ✅ Service is healthy

---

### Step 5: Test Webhook Endpoint (Terminal 2)

**Test 3: Send Message Through Webhook**

```bash
curl -X POST http://localhost:3335/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "update_id": 1,
    "message": {
      "message_id": 1,
      "chat": {"id": 123, "type": "private"},
      "from": {"id": 456, "first_name": "Test"},
      "text": "Book me a flight to Paris"
    }
  }'
```

**Expected response:**

```json
{"ok":true}
```

**Check Terminal 1 logs:**

You should see:

```
hfsp-telegram-bot | [timestamp] ℹ️ Webhook received
hfsp-telegram-bot |   updateId: 1
hfsp-telegram-bot | [timestamp] ℹ️ Processing user message
hfsp-telegram-bot |   userId: 456
hfsp-telegram-bot |   chatId: 123
hfsp-telegram-bot |   text: Book me a flight to Paris
hfsp-telegram-bot | [timestamp] ℹ️ Calling agent-brain
hfsp-agent-brain  | [timestamp] ℹ️ Message processed
hfsp-agent-brain  |   user_id: telegram:456
hfsp-telegram-bot | [timestamp] ℹ️ Agent responded
hfsp-telegram-bot | [timestamp] ℹ️ Response sent to user
```

**What it means:**
- ✅ Webhook received message
- ✅ Telegram Bot parsed the message
- ✅ Telegram Bot called Agent Brain
- ✅ Agent Brain processed it
- ✅ Both containers communicating correctly on hfsp-network

**This is the most important test!** If you see this flow, Docker integration is working.

---

### Step 6: Test Inter-Container Communication (Terminal 2)

**Test 4: Verify containers are on the same network**

```bash
docker network inspect hfsp-network
```

**Expected output:**

```json
[
  {
    "Name": "hfsp-network",
    "Containers": {
      "abc123...": {
        "Name": "hfsp-agent-brain",
        "IPv4Address": "172.20.0.2/16"
      },
      "def456...": {
        "Name": "hfsp-telegram-bot",
        "IPv4Address": "172.20.0.3/16"
      }
    }
  }
]
```

**What it means:**
- ✅ Both containers on same network
- ✅ Can communicate via container names (e.g., `http://agent-brain:3334`)
- ✅ Network isolation working correctly

---

### Step 7: Test Multiple Messages (Terminal 2)

**Test 5: Send 3 different messages**

```bash
# Message 1
curl -X POST http://localhost:3335/webhook \
  -H "Content-Type: application/json" \
  -d '{"update_id":2,"message":{"message_id":2,"chat":{"id":123},"from":{"id":456},"text":"Setup a DAO"}}'

# Message 2
curl -X POST http://localhost:3335/webhook \
  -H "Content-Type: application/json" \
  -d '{"update_id":3,"message":{"message_id":3,"chat":{"id":123},"from":{"id":456},"text":"Give me trading signals"}}'

# Message 3
curl -X POST http://localhost:3335/webhook \
  -H "Content-Type: application/json" \
  -d '{"update_id":4,"message":{"message_id":4,"chat":{"id":123},"from":{"id":456},"text":"What is my balance?"}}'
```

**Check Terminal 1 logs:**

Each message should show the complete flow:

```
hfsp-telegram-bot | [timestamp] ℹ️ Webhook received
hfsp-telegram-bot | [timestamp] ℹ️ Processing user message
hfsp-telegram-bot | [timestamp] ℹ️ Calling agent-brain
hfsp-agent-brain  | [timestamp] ℹ️ Message processed
hfsp-telegram-bot | [timestamp] ℹ️ Agent responded
hfsp-telegram-bot | [timestamp] ℹ️ Response sent to user
```

**What it means:**
- ✅ Services handle multiple concurrent messages
- ✅ No crashes or errors
- ✅ Consistent behavior across requests
- ✅ Logging works correctly

---

### Step 8: Test Docker Logs Command (Terminal 2)

**Test 6: View logs from both containers**

```bash
# View only telegram-bot logs
docker logs hfsp-telegram-bot

# View only agent-brain logs
docker logs hfsp-agent-brain

# Follow logs in real-time (like Terminal 1)
docker logs -f hfsp-telegram-bot
```

**What it means:**
- ✅ Can inspect logs even after containers stop
- ✅ Log persistence for debugging
- ✅ Production monitoring possible

---

### Step 9: Test Service Health Status (Terminal 2)

**Test 7: Check Docker container health**

```bash
docker ps
```

**Expected output:**

```
CONTAINER ID   IMAGE              STATUS
abc123...      telegram-bot       Up 2 minutes (healthy)
def456...      agent-brain        Up 2 minutes (healthy)
```

**What it means:**
- ✅ Both containers running
- ✅ Health checks passing
- ✅ Services stable

---

### Step 10: Cleanup (Terminal 2)

**Test 8: Stop services gracefully**

```bash
# In Terminal 1, press Ctrl+C to stop docker-compose
```

**You should see:**

```
Stopping hfsp-telegram-bot ... done
Stopping hfsp-agent-brain ... done
Removing hfsp-telegram-bot ... done
Removing hfsp-agent-brain ... done
Removing network hfsp-network
```

**What it means:**
- ✅ Services shut down gracefully
- ✅ Containers removed
- ✅ Network cleaned up
- ✅ No orphaned resources

---

### Step 11: Summary - Docker Testing Checklist

```
✅ Test 1: Docker images built successfully
✅ Test 2: docker-compose up starts both services
✅ Test 3: Agent Brain health check (curl /health)
✅ Test 4: Telegram Bot health check (curl /health)
✅ Test 5: Message flow (webhook → agent → response)
✅ Test 6: Services on same network (hfsp-network)
✅ Test 7: Multiple messages handled correctly
✅ Test 8: Logs accessible via docker logs
✅ Test 9: Container health status shows "healthy"
✅ Test 10: Services stop gracefully
```

**If all checks pass:** ✅ Docker integration testing is complete!

---

---

## COMPARISON: Local vs Docker Testing

| Aspect | Local | Docker |
|--------|-------|--------|
| **Speed** | 🟢 Fastest | 🟡 Slower (5-10s startup) |
| **Debugging** | 🟢 Easiest (direct logs) | 🟡 Requires docker logs |
| **Real Production** | 🟡 Somewhat | 🟢 Exact replica |
| **Code Reloading** | 🟢 Hot reload | ❌ Requires rebuild |
| **Network Config** | 🟡 localhost only | 🟢 Uses docker network |
| **Confidence** | 🟡 Good | 🟢 Best |

---

## Troubleshooting Guide

### Local Testing Issues

**Problem:** `curl: (7) Failed to connect to localhost port 3335`  
**Solution:** Check Terminal 2 - is the service running? Look for error messages.

**Problem:** "Cannot find module X"  
**Solution:** Run `npm install` in the service directory

**Problem:** Service starts but doesn't process messages  
**Solution:** Check environment variables (.env file)

### Docker Testing Issues

**Problem:** `docker: command not found`  
**Solution:** Install Docker Desktop from docker.com

**Problem:** `Cannot connect to port 3334`  
**Solution:** Wait 10 seconds for containers to fully start

**Problem:** `network hfsp-network not found`  
**Solution:** This will be created automatically by docker-compose

**Problem:** Containers exit immediately  
**Solution:** Check logs: `docker logs hfsp-telegram-bot`

---

## Recommended Testing Flow

**For Development:**
1. Use **Local Testing** for quick iteration
2. Before committing, run **Docker Testing**
3. Deploy with confidence

**For Production:**
1. Always run **Docker Testing** first
2. Verify all checks pass
3. Then deploy to VPS

---

