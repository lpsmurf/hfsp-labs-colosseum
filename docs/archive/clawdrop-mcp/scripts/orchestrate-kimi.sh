#!/bin/bash

# Kimi Orchestration Monitor - Hourly Heartbeat Check
# Monitors Kimi's VPS work at 187.124.170.113
# Runs every hour and generates a status report

set -e

KIMI_IP="187.124.170.113"
KIMI_USER="root"
KIMI_REPO="/Users/mac/clawdrop-mcp"
STATUS_FILE="/Users/mac/.kimi-heartbeat/status.log"
REPORT_FILE="/Users/mac/.kimi-heartbeat/latest-report.md"
REPORTS_DIR="/Users/mac/.kimi-heartbeat/hourly-reports"

# Create directories
mkdir -p /Users/mac/.kimi-heartbeat
mkdir -p "$REPORTS_DIR"

# Timestamp
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
REPORT_TIMESTAMP=$(date '+%Y%m%d_%H%M%S')

echo "========================================" >> "$STATUS_FILE"
echo "🔍 Heartbeat Check: $TIMESTAMP" >> "$STATUS_FILE"
echo "========================================" >> "$STATUS_FILE"

# Initialize report
cat > "$REPORT_FILE" << REPORT_START
# Kimi Heartbeat Report
**Time:** $TIMESTAMP

REPORT_START

# Check 1: SSH Connection
echo "Checking SSH connection to Kimi's VPS..." >> "$STATUS_FILE"
if ssh -o ConnectTimeout=5 "$KIMI_USER@$KIMI_IP" "echo 'Connected'" > /dev/null 2>&1; then
  echo "✅ SSH: Connected" | tee -a "$STATUS_FILE" >> "$REPORT_FILE"
else
  echo "❌ SSH: FAILED - Cannot reach VPS" | tee -a "$STATUS_FILE" >> "$REPORT_FILE"
  echo "Last heartbeat: $(date)" >> "$STATUS_FILE"
  exit 1
fi

# Check 2: Git Status
echo "" >> "$REPORT_FILE"
echo "## Git Status" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

LAST_COMMIT=$(ssh "$KIMI_USER@$KIMI_IP" "cd $KIMI_REPO && git log -1 --pretty=format:'%h - %s (%ar)' 2>/dev/null" || echo "No commits")
COMMIT_TIME=$(ssh "$KIMI_USER@$KIMI_IP" "cd $KIMI_REPO && git log -1 --pretty=format:'%at' 2>/dev/null" || echo "0")

echo "Last commit: $LAST_COMMIT" | tee -a "$STATUS_FILE" >> "$REPORT_FILE"

# Check if commit is within last hour
CURRENT_TIME=$(date +%s)
HOUR_AGO=$((CURRENT_TIME - 3600))

if [ "$COMMIT_TIME" -gt "$HOUR_AGO" ]; then
  COMMIT_AGO_MIN=$(( (CURRENT_TIME - COMMIT_TIME) / 60 ))
  echo "✅ Recent activity: ${COMMIT_AGO_MIN} minutes ago" | tee -a "$STATUS_FILE" >> "$REPORT_FILE"
else
  echo "⚠️  No commits in last hour" | tee -a "$STATUS_FILE" >> "$REPORT_FILE"
fi

# Check 3: Build Status
echo "" >> "$REPORT_FILE"
echo "## Build Status" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "Running build on Kimi's machine..." >> "$STATUS_FILE"
BUILD_OUTPUT=$(ssh "$KIMI_USER@$KIMI_IP" "cd $KIMI_REPO && npm run build 2>&1" || echo "BUILD FAILED")

if echo "$BUILD_OUTPUT" | grep -q "error"; then
  echo "❌ Build: FAILED" | tee -a "$STATUS_FILE" >> "$REPORT_FILE"
  echo "\`\`\`" >> "$REPORT_FILE"
  echo "$BUILD_OUTPUT" | tail -20 >> "$REPORT_FILE"
  echo "\`\`\`" >> "$REPORT_FILE"
else
  echo "✅ Build: SUCCESS" | tee -a "$STATUS_FILE" >> "$REPORT_FILE"
fi

# Check 4: Test Status
echo "" >> "$REPORT_FILE"
echo "## Test Status" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "Running tests on Kimi's machine..." >> "$STATUS_FILE"
TEST_OUTPUT=$(ssh "$KIMI_USER@$KIMI_IP" "cd $KIMI_REPO && npm test 2>&1" || echo "TESTS FAILED")

TEST_COUNT=$(echo "$TEST_OUTPUT" | grep -o "passing" | wc -l || echo "0")

if echo "$TEST_OUTPUT" | grep -q "passing"; then
  echo "✅ Tests: PASSING" | tee -a "$STATUS_FILE" >> "$REPORT_FILE"
  echo "Tests passed" >> "$REPORT_FILE"
else
  echo "❌ Tests: FAILED" | tee -a "$STATUS_FILE" >> "$REPORT_FILE"
  echo "\`\`\`" >> "$REPORT_FILE"
  echo "$TEST_OUTPUT" | tail -20 >> "$REPORT_FILE"
  echo "\`\`\`" >> "$REPORT_FILE"
fi

# Check 5: Task Status (by looking at implemented functions)
echo "" >> "$REPORT_FILE"
echo "## Task Progress" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

HELIUS_EXISTS=$(ssh "$KIMI_USER@$KIMI_IP" "test -f $KIMI_REPO/src/integrations/helius.ts && echo 'yes' || echo 'no'" 2>/dev/null)
HFSP_EXISTS=$(ssh "$KIMI_USER@$KIMI_IP" "test -f $KIMI_REPO/src/provisioner/hfsp-client.ts && echo 'yes' || echo 'no'" 2>/dev/null)

if [ "$HELIUS_EXISTS" = "yes" ]; then
  echo "✅ Task A: Helius integration file created" | tee -a "$STATUS_FILE" >> "$REPORT_FILE"
else
  echo "⚪ Task A: Awaiting helius.ts creation" | tee -a "$STATUS_FILE" >> "$REPORT_FILE"
fi

if [ "$HFSP_EXISTS" = "yes" ]; then
  echo "✅ Task B: HFSP client file created" | tee -a "$STATUS_FILE" >> "$REPORT_FILE"
else
  echo "⚪ Task B: Awaiting hfsp-client.ts creation" | tee -a "$STATUS_FILE" >> "$REPORT_FILE"
fi

# Check 6: Process Status
echo "" >> "$REPORT_FILE"
echo "## Service Status" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

CLAWDROP_PID=$(ssh "$KIMI_USER@$KIMI_IP" "pgrep -f 'npm run dev' | head -1" 2>/dev/null || echo "")
HFSP_PID=$(ssh "$KIMI_USER@$KIMI_IP" "cd /Users/mac/hfsp-agent-provisioning && pgrep -f 'npm run dev' | head -1" 2>/dev/null || echo "")

if [ -n "$CLAWDROP_PID" ]; then
  echo "✅ Clawdrop dev server: Running (PID: $CLAWDROP_PID)" | tee -a "$STATUS_FILE" >> "$REPORT_FILE"
else
  echo "⚠️  Clawdrop dev server: Not running" | tee -a "$STATUS_FILE" >> "$REPORT_FILE"
fi

if [ -n "$HFSP_PID" ]; then
  echo "✅ HFSP provisioner: Running (PID: $HFSP_PID)" | tee -a "$STATUS_FILE" >> "$REPORT_FILE"
else
  echo "⚠️  HFSP provisioner: Not running" | tee -a "$STATUS_FILE" >> "$REPORT_FILE"
fi

# Summary
echo "" >> "$REPORT_FILE"
echo "## Summary" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

if echo "$BUILD_OUTPUT" | grep -q "error"; then
  echo "**Status:** 🔴 BUILD FAILING" >> "$REPORT_FILE"
elif echo "$TEST_OUTPUT" | grep -q "error"; then
  echo "**Status:** 🟡 TESTS FAILING" >> "$REPORT_FILE"
elif [ "$COMMIT_TIME" -gt "$HOUR_AGO" ]; then
  echo "**Status:** 🟢 ON TRACK" >> "$REPORT_FILE"
else
  echo "**Status:** 🟡 NO RECENT ACTIVITY" >> "$REPORT_FILE"
fi

echo "" >> "$REPORT_FILE"
echo "**Last Check:** $TIMESTAMP" >> "$REPORT_FILE"
echo "**Next Check:** $(date -v+1H '+%H:%M')" >> "$REPORT_FILE"

# Copy report to hourly archive
cp "$REPORT_FILE" "$REPORTS_DIR/report_${REPORT_TIMESTAMP}.md"

echo "" >> "$STATUS_FILE"
echo "✅ Heartbeat check complete at $TIMESTAMP" >> "$STATUS_FILE"
echo "Report saved to: $REPORT_FILE" >> "$STATUS_FILE"
echo "" >> "$STATUS_FILE"

