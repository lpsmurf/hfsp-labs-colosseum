# 🚀 Trial App Launch Checklist

Complete verification before declaring the trial app ready for production.

---

## Phase 1: Integration Verification ✅

- [x] Backend SSE streaming proven (60+ chunks)
- [x] 5 Solana tools integrated and tested
- [x] Rate-limit (10 msg/day) implemented
- [x] Budget-guard ($50/day) implemented
- [x] Frontend fully built and tested
- [x] Docker setup complete
- [x] Nginx config ready
- [x] E2E test script created

---

## Phase 2: Deployment Blockers (PENDING)

### Kimi's PR Integration
- [ ] PR #5 reviewed by Kimi
- [ ] Decision made: merge #5 OR adapt PR #4
- [ ] Backend code merged to main
- [ ] Docker build tested

### Gemini's Nginx Deployment
- [ ] trial.conf deployed to /etc/nginx/conf.d/
- [ ] Nginx reloaded successfully
- [ ] SSL certificate valid for clawdrop.live
- [ ] HTTP → HTTPS redirect working

---

## Phase 3: Live Verification (POST-DEPLOYMENT)

### Health Checks
```bash
[ ] curl https://clawdrop.live/api/health → returns 200 + budget_remaining
[ ] curl https://clawdrop.live/api/quota?ip=test → returns used/limit/resets_at
[ ] curl -X POST https://clawdrop.live/api/chat → SSE stream starts
```

### Frontend Checks
```bash
[ ] https://clawdrop.live/try loads in browser
[ ] Page renders correctly on mobile (375px)
[ ] Chat input accepts text
[ ] SSE messages stream in real-time
```

### Tool Execution
```bash
[ ] Send: "what is the price of SOL"
[ ] Tool executes and returns data
[ ] Price displays in message
[ ] Multiple tool calls work correctly
```

### Rate Limiting & Budget
```bash
[ ] Send 10 messages → remaining shows 0
[ ] Send 11th message → 429 error (daily limit)
[ ] Budget tracking shows spend < $50
[ ] Paywall shows on message 11
```

### Paywall
```bash
[ ] Send 11+ messages
[ ] PaywallModal appears
[ ] Phantom button is clickable
[ ] User can dismiss and continue (if under budget)
```

---

## Phase 4: Performance & Reliability

### Load Testing
```bash
[ ] Run: bash scripts/test-trial-e2e.sh https://clawdrop.live
[ ] All endpoints respond < 2s
[ ] No connection timeouts
[ ] Streaming completes fully
```

### Error Handling
```bash
[ ] Invalid JSON → 400 error
[ ] Missing sessionId → handled gracefully
[ ] API key invalid → proper error message
[ ] Rate limit hit → clear error
```

### Data Persistence
```bash
[ ] IP quotas saved to SQLite
[ ] Daily reset works at UTC midnight
[ ] Budget ledger accurate
[ ] No data loss on restart
```

---

## Phase 5: Security & Compliance

- [ ] API keys NOT in git (only .env files)
- [ ] SSL/TLS configured correctly
- [ ] CORS origins whitelisted
- [ ] Rate limiting in place (10 req/s for API)
- [ ] Budget limit enforced ($50/day)
- [ ] No wallet addresses logged
- [ ] No API keys in logs
- [ ] Appropriate timeouts set (300s for SSE)

---

## Phase 6: Documentation

- [ ] TRIAL_DEPLOYMENT.md reviewed
- [ ] .env.example complete and accurate
- [ ] README updated with trial endpoint
- [ ] Team knows how to monitor/troubleshoot
- [ ] Runbooks for common issues

---

## Sign-Off

**Backend Ready**: Kimi ___________  Date: ___________

**Frontend Ready**: Codex ___________  Date: ___________

**Deployment Ready**: Gemini ___________  Date: ___________

**QA Approved**: Claude ___________  Date: ___________

**LAUNCH APPROVED**: ___________  Date: ___________

---

## Post-Launch Monitoring

### Daily
- [ ] Check budget remaining (should decrease slowly)
- [ ] Monitor error logs for patterns
- [ ] Verify SSL certificate expiry

### Weekly
- [ ] Review quota usage patterns
- [ ] Check for any security alerts
- [ ] Update documentation with learnings

### Emergency Procedures
- [ ] If budget exceeded: disable endpoint, check for abuse
- [ ] If SSL expires: renew certificate immediately
- [ ] If high error rate: roll back last deployment

---

**Last Updated**: 2026-05-05 16:25 UTC
**Version**: 1.0
