# Kimi Orchestration System

Automated hourly monitoring of Kimi's development work on VPS 187.124.170.113.

## What This Does

Every hour at `:07` minutes, the system:
1. **Connects to Kimi's VPS** via SSH
2. **Checks git activity** - Latest commits
3. **Runs build** - `npm run build` 
4. **Runs tests** - `npm test`
5. **Generates report** - Status of all systems and tasks
6. **Archives reports** - Saves hourly snapshots for history

## Viewing Status

### Quick View (Real-time Dashboard)
```bash
/Users/mac/view-kimi-status.sh
```

Shows:
- Latest heartbeat report
- Recent status log
- Available archived reports
- Next check time

### Raw Files

- **Latest Report**: `/Users/mac/.kimi-heartbeat/latest-report.md`
- **Status Log**: `/Users/mac/.kimi-heartbeat/status.log`
- **Hourly Archives**: `/Users/mac/.kimi-heartbeat/hourly-reports/`

## Schedule

```
Minute: :07 (at 7 minutes past every hour)
Frequency: Every hour, 24/7
Timezone: Your local Mac timezone
```

Examples:
- 1:07 AM, 2:07 AM, 3:07 AM, ... 11:07 PM

## Manual Run

Force a check right now:
```bash
/Users/mac/orchestrate-kimi.sh
```

This also runs automatically via cron.

## Report Contents

Each report shows:

### Git Status
- Last commit hash, message, and time
- Whether commits happened in last hour
- ✅ ON TRACK or ⚠️ NO ACTIVITY

### Build Status
- ✅ SUCCESS or ❌ FAILED
- First 20 lines of any errors

### Test Status
- ✅ PASSING or ❌ FAILING
- Test count and results

### Task Progress
- Task A (Helius integration): ⚪ PENDING / 🟡 IN PROGRESS / ✅ COMPLETE
- Task B (HFSP integration): ⚪ PENDING / 🟡 IN PROGRESS / ✅ COMPLETE

### Service Status
- Clawdrop dev server: RUNNING or NOT RUNNING
- HFSP provisioner: RUNNING or NOT RUNNING

### Overall Summary
- 🔴 BUILD FAILING (code won't compile)
- 🟡 TESTS FAILING (code compiles but tests fail)
- 🟡 NO RECENT ACTIVITY (no commits in last hour)
- 🟢 ON TRACK (building, testing, committing)

## What To Do If Something's Wrong

### 🔴 BUILD FAILING
- Check the error output in the report
- SSH to Kimi's VPS: `ssh root@187.124.170.113`
- Run build manually: `cd /Users/mac/clawdrop-mcp && npm run build`
- Review the failing code with Kimi

### 🟡 TESTS FAILING
- Build is OK but tests fail
- Could mean Helius/HFSP integration not working yet
- Wait for Kimi to complete Task A, then Task B
- Check test output for specific failures

### 🟡 NO RECENT ACTIVITY
- No commits in last hour
- Kimi might be debugging offline
- Check if he needs help - contact him
- Don't assume he's stuck, might just be thinking

### ⚠️ SSH CONNECTION FAILED
- Kimi's VPS might be down
- Check internet connectivity
- SSH key might need re-setup
- Run: `ssh-keygen -l -f ~/.ssh/id_rsa`

## Timeline

**Wednesday**
- Task A (Helius): Should see commits by afternoon
- Task B (HFSP): Should see commits by evening

**Thursday**
- Should see build passing and tests working
- Integration testing and debugging

**Friday**
- Final smoke tests and demo preparation

## Key Metrics To Track

As reports come in, watch for:

| Metric | Good | Watch | Alarm |
|--------|------|-------|-------|
| **Commits** | Every 30-60 min | Hourly or less | None in 2+ hours |
| **Build** | Always passing | One failure then fixed | Persistent failures |
| **Tests** | All passing | Some failing | All failing |
| **Task A** | ✅ Complete by Wed PM | 🟡 In progress Wed | ❌ Not started Wed PM |
| **Task B** | ✅ Complete by Wed PM | 🟡 In progress Thu | ❌ Not started Thu |
| **Services** | Both running | One down | Both down |

## Automation Details

**Script**: `/Users/mac/orchestrate-kimi.sh`
- Bash script that handles all monitoring logic
- Runs via cron every hour
- Generates markdown reports

**Cron Setup**:
```bash
crontab -l | grep kimi  # View the cron job
```

**Logging**:
- Cron output: `/Users/mac/.kimi-heartbeat/cron.log`
- Script output: Status and reports files

## Support

If heartbeat isn't working:

1. Check cron is running:
   ```bash
   crontab -l | grep "Kimi Heartbeat"
   ```

2. Check SSH key:
   ```bash
   ssh -v root@187.124.170.113 "echo test"
   ```

3. Run script manually:
   ```bash
   bash -x /Users/mac/orchestrate-kimi.sh
   ```

4. Check logs:
   ```bash
   tail -50 /Users/mac/.kimi-heartbeat/cron.log
   ```
