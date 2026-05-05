#!/bin/bash
# Watch team progress in real-time

INTERVAL=${1:-10}  # Check every 10 seconds by default

echo "👀 WATCHING TEAM PROGRESS (checking every ${INTERVAL}s)..."
echo "Press Ctrl+C to stop"
echo ""

while true; do
    clear
    echo "🔍 TEAM PROGRESS MONITOR"
    echo "Last check: $(date '+%H:%M:%S')"
    echo "════════════════════════════════════════════════════════════"
    echo ""

    # Check PR #5
    echo "📋 KIMI — PR #5 (Decision needed)"
    PR_STATE=$(gh pr view 5 --json state --jq '.state' 2>/dev/null)
    if [ "$PR_STATE" = "MERGED" ]; then
        echo "   ✅ APPROVED & MERGED — Kimi is done!"
    else
        echo "   ⏳ Still open — waiting for decision"
    fi
    echo ""

    # Check Nginx
    echo "🌐 GEMINI — Nginx (Deploy needed)"
    HEALTH=$(curl -s -m 3 https://clawdrop.live/api/health 2>&1)
    if echo "$HEALTH" | grep -q '"status":"ok"'; then
        echo "   ✅ DEPLOYED & RESPONDING — Gemini is done!"
        echo "   Response: $(echo "$HEALTH" | jq -r '.status')"
    else
        echo "   ⏳ Not responding yet — waiting for deployment"
    fi
    echo ""

    # Overall status
    echo "════════════════════════════════════════════════════════════"
    if [ "$PR_STATE" = "MERGED" ] && echo "$HEALTH" | grep -q '"status":"ok"'; then
        echo "🎉 BOTH TASKS COMPLETE!"
        echo ""
        echo "Next step: Run E2E test"
        echo "  bash scripts/test-trial-e2e.sh https://clawdrop.live"
        echo ""
        break
    elif [ "$PR_STATE" = "MERGED" ]; then
        echo "⚠️  Kimi done, waiting on Gemini..."
    elif echo "$HEALTH" | grep -q '"status":"ok"'; then
        echo "⚠️  Gemini done, waiting on Kimi..."
    else
        echo "⏳ Waiting for both tasks to complete..."
    fi
    
    echo "Checking again in ${INTERVAL}s... (Ctrl+C to stop)"
    sleep "$INTERVAL"
done
