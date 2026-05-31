#!/bin/bash
# Escalate alerts if team members are not working

echo "🚨 ESCALATION CHECK"
echo ""

# Check if Kimi approved PR
PR_STATE=$(gh pr view 5 --json state --jq '.state' 2>/dev/null)

# Check if Gemini deployed nginx
NGINX_UP=$(curl -s -m 3 https://clawdrop.live/api/health 2>&1 | grep -q '"status":"ok"' && echo "yes" || echo "no")

if [ "$PR_STATE" = "MERGED" ] && [ "$NGINX_UP" = "yes" ]; then
    echo "✅ BOTH TASKS COMPLETE — proceeding with E2E test"
    exit 0
fi

echo ""
if [ "$PR_STATE" != "MERGED" ]; then
    echo "❌ Kimi: PR #5 still open (not approved)"
    echo "   Action: Click APPROVE at https://github.com/lpsmurf/hfsp-labs-colosseum/pull/5"
fi

if [ "$NGINX_UP" != "yes" ]; then
    echo "❌ Backend: API health check not responding"
    echo "   Action: Check Mac Mini services:"
    echo "     pm2 list"
    echo "     cloudflared tunnel list"
    echo "     # Verify clawdrop-live tunnel is running and DNS is routed"
fi

echo ""
echo "⏳ Waiting for action... (re-check in 10 seconds)"
sleep 10
exec "$0"  # Re-run escalation
