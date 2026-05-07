# KIMI — FINAL TASK: Start Backend on VPS

**Status**: Gemini deployed nginx but doesn't have terminal access.
You're the final blocker. 10 minutes. Then we launch.

---

## What Happened

- ✅ You merged PR #5 (backend code live on main)
- ✅ Codex built the UI
- ✅ Gemini deployed nginx routing on clawdrop.live
- ❌ Backend service NOT running on VPS yet

The nginx is there, but the actual backend service needs to START on the VPS.

---

## Your 10-Minute Task

SSH to VPS and start the backend service:

```bash
ssh root@72.62.239.63

# Navigate to repo
cd /srv/colosseum/packages/trial-api
# (adjust path if different)

# Install + build
npm ci --production
npm run build

# Start service
npm start &
# OR use PM2:
# pm2 start dist/server.js --name trial-api
# pm2 save

# Test
curl https://clawdrop.live/api/health
```

**Expected response**:
```json
{"status":"ok","version":"0.1.0","budget_remaining":50}
```

If you see that → ✅ YOU'RE DONE.

---

## Why You?

You own the backend code. You know it. You can troubleshoot if needed.
Gemini deployed the routing layer. Now you light up the backend.

---

## Timeline

- NOW: You start backend (10 min)
- +10: Backend live on VPS ✅
- +20: Claude runs E2E test
- +25: 🚀 LAUNCH

---

## After You're Done

1. Confirm `curl https://clawdrop.live/api/health` returns JSON ✅
2. Update WORKLOG: "Backend service started on VPS ✅"
3. Tell Claude: "Backend is live"
4. Claude runs E2E test → LAUNCH 🚀

---

**You've already won by merging PR #5.**
**This is the victory lap.**

Go.
