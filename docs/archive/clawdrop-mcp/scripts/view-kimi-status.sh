#!/bin/bash

# Dashboard to view Kimi's latest heartbeat status
REPORT_FILE="/Users/mac/.kimi-heartbeat/latest-report.md"
STATUS_FILE="/Users/mac/.kimi-heartbeat/status.log"
REPORTS_DIR="/Users/mac/.kimi-heartbeat/hourly-reports"

clear

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║          KIMI ORCHESTRATION DASHBOARD                          ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

if [ -f "$REPORT_FILE" ]; then
  echo "📊 LATEST HEARTBEAT REPORT:"
  echo ""
  cat "$REPORT_FILE"
else
  echo "⏳ No heartbeat report yet. First check runs at the top of each hour."
  echo "   Check back in a few minutes or run manually:"
  echo "   /Users/mac/orchestrate-kimi.sh"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""

if [ -f "$STATUS_FILE" ]; then
  echo "📝 RECENT STATUS LOG (last 20 lines):"
  echo ""
  tail -20 "$STATUS_FILE"
else
  echo "No status log yet."
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "📁 Available Reports:"
ls -lht "$REPORTS_DIR" 2>/dev/null | head -10 | awk '{print $9, "(" $6, $7, $8 ")"}' | grep -v "^$"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "🔄 Heartbeat Schedule: Every hour at :07 minutes"
echo "📍 Latest report:     $REPORT_FILE"
echo "📂 Reports directory: $REPORTS_DIR"
echo ""
echo "Commands:"
echo "  • View status:      ./view-kimi-status.sh"
echo "  • Run now:          /Users/mac/orchestrate-kimi.sh"
echo "  • View raw report:  cat $REPORT_FILE"
echo "  • Check cron:       crontab -l | grep kimi"
