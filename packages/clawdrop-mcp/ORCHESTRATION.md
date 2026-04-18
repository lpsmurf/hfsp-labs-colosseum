# Orchestration & Monitoring Setup

Monitor Kimi's progress in real-time and orchestrate automated testing.

---

## Option 1: Git Commit Monitoring (Recommended)

**What it does**: Automatically detect when Kimi commits code and run tests

**Setup**:
```bash
# Create a monitoring script
cat > monitor-kimi.sh << 'SCRIPT'
#!/bin/bash
LAST_COMMIT=""

while true; do
  # Get latest commit hash
  LATEST=$(cd /Users/mac/clawdrop-mcp && git log -1 --format=%H 2>/dev/null)
  
  if [ "$LATEST" != "$LAST_COMMIT" ]; then
    LAST_COMMIT=$LATEST
    
    # Get commit message
    MSG=$(cd /Users/mac/clawdrop-mcp && git log -1 --format=%B)
    AUTHOR=$(cd /Users/mac/clawdrop-mcp && git log -1 --format=%an)
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "✓ New commit from $AUTHOR"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "$MSG"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Run tests
    echo "Running integration tests..."
    cd /Users/mac/clawdrop-mcp && npm test 2>&1 | tail -20
    
    echo ""
    echo "Build status: $(cd /Users/mac/clawdrop-mcp && npm run build > /dev/null 2>&1 && echo '✅ SUCCESS' || echo '❌ FAILED')"
    echo ""
  fi
  
  sleep 5
done
SCRIPT

chmod +x monitor-kimi.sh
./monitor-kimi.sh
```

---

## Option 2: SSH into Kimi's VPS + Monitor

**What it does**: Direct connection to Kimi's development environment

**Setup**:
```bash
# SSH into Kimi's VPS
ssh user@kimi-vps.hostinger.com

# Once connected, run:
cd /Users/mac/clawdrop-mcp

# Watch for file changes
watch -n 2 'git log -1 --oneline'

# Or tail the logs:
npm run dev | grep -E "info|error|Task"

# Or run tests in watch mode:
npm test -- --watch
```

---

## Option 3: Automated Status API (Advanced)

**What it does**: Kimi's VPS exposes a status endpoint you can poll

**Kimi's VPS Setup** (`.claude/status-server.js`):
```javascript
const express = require('express');
const { execSync } = require('child_process');
const app = express();

app.get('/api/status', (req, res) => {
  try {
    const lastCommit = execSync('git log -1 --format="%H|%an|%s"').toString().trim();
    const [hash, author, message] = lastCommit.split('|');
    
    const testResult = execSync('npm test 2>&1 | tail -5').toString();
    const buildStatus = execSync('npm run build > /dev/null 2>&1 && echo "✅" || echo "❌"').toString().trim();
    
    res.json({
      lastCommit: { hash, author, message },
      buildStatus,
      testsPassing: testResult.includes('passed'),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.json({ error: err.message });
  }
});

app.listen(3002, () => console.log('Status API on :3002'));
```

**Your monitoring** (schedule this):
```bash
curl http://kimi-vps.hostinger.com:3002/api/status | jq .
```

---

## Option 4: Scheduled Orchestration Tasks

**What it does**: Automatically run checks at intervals

**Setup** (use CronCreate):
```bash
# Every 5 minutes: Check Kimi's latest commit
cron: "*/5 * * * *"
prompt: "Check Kimi's latest git commits in /Users/mac/clawdrop-mcp and report any new work"

# Every 30 minutes: Run full test suite
cron: "*/30 * * * *"
prompt: "Run 'npm test' in /Users/mac/clawdrop-mcp and report results"

# Daily: Generate progress report
cron: "0 18 * * *"
prompt: "Generate daily progress report: commits today, test status, build status"
```

---

## Option 5: Real-Time Notifications (Discord/Slack)

**What it does**: Get alerts when Kimi commits code

**Setup**:
```bash
# After each commit, send webhook
cat > .git/hooks/post-commit << 'HOOK'
#!/bin/bash
COMMIT_MSG=$(git log -1 --format=%B)
AUTHOR=$(git log -1 --format=%an)

curl -X POST \
  -H 'Content-Type: application/json' \
  -d "{\"text\": \"🔨 $AUTHOR committed: $COMMIT_MSG\"}" \
  https://hooks.slack.com/services/YOUR/WEBHOOK/HERE
HOOK

chmod +x .git/hooks/post-commit
```

---

## What I Recommend: Multi-Layer Monitoring

**Layer 1: Real-Time Git Monitoring** (You run this)
```bash
# In one terminal, run the git monitor script
./monitor-kimi.sh
```

**Layer 2: Scheduled Status Checks** (I can set up)
- Every 30 min: Run integration tests
- Every hour: Check build status
- Daily: Generate progress report

**Layer 3: Direct SSH Access** (If needed)
- SSH into VPS to see logs
- Check file changes in real-time
- Run manual tests

---

## Recommended Commands

**Start monitoring Kimi's work**:
```bash
# Terminal 1: Git commit monitor
./monitor-kimi.sh

# Terminal 2: Run Clawdrop dev server
npm run dev

# Terminal 3: SSH into Kimi's VPS
ssh user@kimi-vps.hostinger.com
cd /Users/mac/clawdrop-mcp
npm run dev
```

**Orchestrate automated testing**:
```bash
# Run tests on every commit (git hook)
cat > .git/hooks/post-commit << 'HOOK'
#!/bin/bash
npm test && npm run build && echo "✅ All checks passed" || echo "❌ Tests failed"
HOOK
chmod +x .git/hooks/post-commit
```

---

## What to Monitor

**Daily**:
- [ ] Git commits from Kimi
- [ ] Test pass/fail status
- [ ] Build status
- [ ] Code coverage

**Per commit**:
- [ ] Does it compile?
- [ ] Do tests pass?
- [ ] Are there errors?
- [ ] Does it integrate?

**By Friday**:
- [ ] Task A complete (Solana verification)
- [ ] Task B complete (HFSP integration)
- [ ] All tests passing
- [ ] Ready for demo

---

## Status Board (What I Can Provide)

I can set up automated reports showing:

```
📊 CLAWDROP STATUS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Last Commit:   2 min ago (Kimi)
Task A Status: 60% (Solana verification)
Task B Status: 40% (HFSP integration)
Build Status:  ✅ PASSING
Tests:         5/5 passing ✅
Code:          Clean, no warnings ✅
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Next Check:    15:45 (30 min)
```

---

## Let's Set Up Live Monitoring

Which would you prefer?

1. **Git Monitoring Script** - Simple, local, real-time
2. **Scheduled Status Checks** - Automated, regular intervals
3. **SSH Direct Access** - Full control, can see everything
4. **All Three** - Complete visibility

I recommend Option 4 (All Three) for maximum visibility into Kimi's progress.
