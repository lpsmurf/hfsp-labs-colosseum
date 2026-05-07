# Kimi Orchestration - Quick Start

## 5-Minute Setup

### 1. One-Time SSH Setup (1 minute)
```bash
ssh-copy-id -i ~/.ssh/id_rsa root@187.124.170.113
# Enter Kimi's VPS root password when prompted
```

Verify it works:
```bash
ssh root@187.124.170.113 "echo 'Connected!'"
```

Should show `Connected!` with no password prompt.

### 2. View Dashboard (1 minute)
```bash
/Users/mac/view-kimi-status.sh
```

Shows:
- Latest heartbeat report
- Build and test status
- Task progress (A and B)
- Service health

### 3. That's It!

The system automatically:
- ✅ Checks Kimi's VPS every hour at :07 minutes
- ✅ Runs build and tests
- ✅ Reports status
- ✅ Archives hourly reports for history

## Daily Workflow

### Morning (Check overnight progress)
```bash
/Users/mac/view-kimi-status.sh
```

### If You See 🔴 BUILD FAILING or 🟡 TESTS FAILING
```bash
ssh root@187.124.170.113
cd /Users/mac/clawdrop-mcp
npm run build   # See build errors
npm test        # See test failures
```

### Manual Check (Force right now)
```bash
/Users/mac/orchestrate-kimi.sh
```

## What You'll See

### Good Status 🟢
```
✅ SSH: Connected
✅ Recent activity: 15 minutes ago
✅ Build: SUCCESS
✅ Tests: PASSING
✅ Task A: In progress
⚪ Task B: Awaiting completion
✅ Clawdrop dev server: Running
Status: 🟢 ON TRACK
```

### Problem Status 🔴
```
✅ SSH: Connected
⚠️ No commits in last hour
❌ Build: FAILED
⚠️ Tests: Awaiting Task A completion
🟡 Clawdrop dev server: Not running
Status: 🔴 BUILD FAILING
```

## Files and Locations

| File | Purpose |
|------|---------|
| `/Users/mac/orchestrate-kimi.sh` | Main monitoring script |
| `/Users/mac/view-kimi-status.sh` | Dashboard viewer |
| `/Users/mac/.kimi-heartbeat/latest-report.md` | Current status report |
| `/Users/mac/.kimi-heartbeat/hourly-reports/` | Historical reports |
| `/Users/mac/.kimi-heartbeat/status.log` | Full activity log |

## Expected Timeline

| When | What You'll See |
|------|-----------------|
| Wed Afternoon | Task A (Helius) commits start appearing |
| Wed Evening | Task B (HFSP) commits start appearing |
| Thu Morning | Build passing, tests working |
| Thu Afternoon | Full integration working |
| Fri AM | Ready for demo |

## Commands Reference

```bash
# View dashboard
/Users/mac/view-kimi-status.sh

# Run check manually right now
/Users/mac/orchestrate-kimi.sh

# View latest report
cat /Users/mac/.kimi-heartbeat/latest-report.md

# SSH to Kimi's VPS
ssh root@187.124.170.113

# Check cron schedule
crontab -l | grep kimi

# View cron logs
tail -20 /Users/mac/.kimi-heartbeat/cron.log
```

## Troubleshooting

**"SSH: Connection refused"**
→ Check if VPS is up: `ping 187.124.170.113`

**"No heartbeat report yet"**
→ Wait for next hour (:07 minute mark) or run: `/Users/mac/orchestrate-kimi.sh`

**"Build failing"**
→ SSH to VPS and run: `cd /Users/mac/clawdrop-mcp && npm run build`

**"No recent commits"**
→ Kimi might be thinking. Check back in an hour or contact him.

## Success Looks Like

By Friday morning, the dashboard will show:
- ✅ BUILD: SUCCESS
- ✅ TESTS: PASSING  
- ✅ Task A: COMPLETE (Helius integration)
- ✅ Task B: COMPLETE (HFSP integration)
- ✅ Both services running
- 🟢 Status: ON TRACK

Then you know Kimi is ready for the Friday demo.
