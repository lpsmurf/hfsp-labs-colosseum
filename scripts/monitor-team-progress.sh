#!/bin/bash
# Monitor team progress toward launch

echo "🔍 MONITORING TEAM PROGRESS..."
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 1. Check Kimi's PR #5 status
echo "═══════════════════════════════════════"
echo "📋 KIMI — PR #5 Status"
echo "═══════════════════════════════════════"
PR_STATE=$(gh pr view 5 --json state,reviews --jq '.state')
PR_REVIEWS=$(gh pr view 5 --json reviews --jq '.reviews | length')

if [ "$PR_STATE" = "MERGED" ]; then
    echo -e "${GREEN}✅ PR #5 MERGED${NC}"
elif [ "$PR_STATE" = "OPEN" ]; then
    echo -e "${RED}⏳ PR #5 Still open${NC} (needs approval)"
    echo "   Reviews: $PR_REVIEWS"
else
    echo -e "${YELLOW}❓ PR #5 Status: $PR_STATE${NC}"
fi
echo ""

# 2. Check Gemini's nginx deployment
echo "═══════════════════════════════════════"
echo "🌐 GEMINI — Nginx Deployment"
echo "═══════════════════════════════════════"

# Test if API is responding
HEALTH=$(curl -s -m 5 https://clawdrop.live/api/health 2>&1)

if echo "$HEALTH" | grep -q '"status":"ok"'; then
    echo -e "${GREEN}✅ NGINX DEPLOYED${NC}"
    echo "   Response: $HEALTH"
elif echo "$HEALTH" | grep -q "Connection refused\|curl\|Failed"; then
    echo -e "${RED}❌ Nginx not responding${NC}"
    echo "   Error: $HEALTH"
else
    echo -e "${YELLOW}⏳ Testing...: $HEALTH${NC}"
fi
echo ""

# 3. Check recent commits from other agents
echo "═══════════════════════════════════════"
echo "📝 Recent Agent Activity (last 30 min)"
echo "═══════════════════════════════════════"

git fetch origin --quiet 2>/dev/null
RECENT=$(git log --all --since="30 minutes ago" --oneline | grep -vE "\[claude\]")

if [ -z "$RECENT" ]; then
    echo -e "${YELLOW}⏳ No commits from Kimi/Codex/Gemini in last 30 min${NC}"
else
    echo -e "${GREEN}Activity detected:${NC}"
    echo "$RECENT"
fi
echo ""

# 4. Summary
echo "═══════════════════════════════════════"
echo "📊 LAUNCH READINESS"
echo "═══════════════════════════════════════"

if [ "$PR_STATE" = "MERGED" ] && echo "$HEALTH" | grep -q '"status":"ok"'; then
    echo -e "${GREEN}✅ BOTH TASKS COMPLETE — READY FOR E2E TEST${NC}"
    echo ""
    echo "Run: bash scripts/test-trial-e2e.sh https://clawdrop.live"
elif [ "$PR_STATE" = "MERGED" ]; then
    echo -e "${YELLOW}⚠️  PR MERGED — Waiting on Gemini nginx deployment${NC}"
elif echo "$HEALTH" | grep -q '"status":"ok"'; then
    echo -e "${YELLOW}⚠️  Nginx ready — Waiting on Kimi PR approval${NC}"
else
    echo -e "${RED}❌ Both tasks still pending${NC}"
fi
echo ""

# 5. Auto-check interval
echo "═══════════════════════════════════════"
echo "💡 Tips:"
echo "═══════════════════════════════════════"
echo "• Run this script in a loop: watch -n 10 bash scripts/monitor-team-progress.sh"
echo "• Or manually check:"
echo "  - Kimi: gh pr view 5 --json state,reviews"
echo "  - Gemini: curl https://clawdrop.live/api/health"
echo "• Check WORKLOG.md for status updates"
