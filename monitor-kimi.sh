#!/bin/bash
set -e

LAST_COMMIT=""
REPO_PATH="/Users/mac/clawdrop-mcp"
COLORS='\033[0;36m'
NC='\033[0m'

echo -e "${COLORS}🚀 Kimi Work Monitor Started${NC}"
echo "Watching: $REPO_PATH"
echo "Press Ctrl+C to stop"
echo ""

while true; do
  LATEST=$(cd "$REPO_PATH" && git log -1 --format=%H 2>/dev/null || echo "")
  
  if [ -n "$LATEST" ] && [ "$LATEST" != "$LAST_COMMIT" ]; then
    LAST_COMMIT=$LATEST
    
    MSG=$(cd "$REPO_PATH" && git log -1 --format=%B)
    AUTHOR=$(cd "$REPO_PATH" && git log -1 --format=%an)
    TIME=$(cd "$REPO_PATH" && git log -1 --format=%ar)
    HASH=$(cd "$REPO_PATH" && git log -1 --format=%h)
    
    echo -e "${COLORS}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${COLORS}✓ New Commit Detected${NC}"
    echo -e "${COLORS}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo "Author:   $AUTHOR"
    echo "Time:     $TIME"
    echo "Hash:     $HASH"
    echo "Message:  $MSG"
    echo ""
    
    # Run build
    echo "📦 Building..."
    if cd "$REPO_PATH" && npm run build > /tmp/build.log 2>&1; then
      echo -e "${COLORS}✅ Build PASSED${NC}"
    else
      echo -e "\033[0;31m❌ Build FAILED${NC}"
      tail -10 /tmp/build.log
    fi
    
    # Run tests
    echo ""
    echo "🧪 Running Tests..."
    if cd "$REPO_PATH" && npm test > /tmp/test.log 2>&1; then
      PASS_COUNT=$(grep -c "PASS\|✓\|passed" /tmp/test.log || echo "0")
      echo -e "${COLORS}✅ Tests PASSED${NC}"
    else
      echo -e "\033[0;31m❌ Tests FAILED${NC}"
      tail -15 /tmp/test.log
    fi
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Status: Ready for integration"
    echo ""
  fi
  
  sleep 5
done
