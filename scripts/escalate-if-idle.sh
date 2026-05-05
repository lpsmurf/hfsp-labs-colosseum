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
    echo "❌ Gemini: Nginx not responding"
    echo "   Action: Run deployment commands:"
    echo "     ssh root@72.62.239.63"
    echo "     cd /etc/nginx/conf.d"
    echo "     curl -o trial.conf https://raw.githubusercontent.com/lpsmurf/hfsp-labs-colosseum/claude/integrate-trial-backend/config/nginx/conf.d/trial.conf"
    echo "     nginx -s reload"
fi

echo ""
echo "⏳ Waiting for action... (re-check in 10 seconds)"
sleep 10
exec "$0"  # Re-run escalation
