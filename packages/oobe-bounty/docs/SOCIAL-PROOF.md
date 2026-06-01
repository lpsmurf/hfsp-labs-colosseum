# Social Proof — Clawdrop x OOBE Protocol Bounty

> Updated 2026-06-01. Add screenshots and YouTube link before final submission.

---

## Twitter @ClawdropPriceBot

- **Followers:** ___ (check and add manually)
- **Tweets posted:** 112 (from DB `on_twitter` count)
- **Profile URL:** https://twitter.com/ClawdropPriceBot

### Screenshots Needed
- [ ] Profile page showing follower count
- [ ] Feed showing recent tweets with timestamps
- [ ] Sample tweet with engagement metrics

---

## Telegram @ClawdropSignals

- **Channel ID:** `-1003902301220`
- **Members:** ___ (check and add manually)
- **Messages posted:** 274 (all 274 signals distributed)
- **Channel URL:** https://t.me/ClawdropSignals

### Screenshots Needed
- [ ] Channel view showing messages
- [ ] Info panel showing member count
- [ ] Message list showing recent signals

---

## Database Verification

```bash
sqlite3 packages/oobe-bounty/data/bounty-vault.db \
  "SELECT COUNT(*) as total, \
          SUM(CASE WHEN posted_to_twitter THEN 1 ELSE 0 END) as on_twitter, \
          SUM(CASE WHEN posted_to_telegram THEN 1 ELSE 0 END) as on_telegram \
   FROM trading_signals;"
```

**Result (2026-06-01):**
```
total | on_twitter | on_telegram
274   | 112        | 274
```

---

## SAP Agent Registry

All 6 agents registered on Solana:
- **SAP ID:** `8m5MXkunTGabXKLrmVCj2WekLF4V2WwB3gKGuAc872rx`
- **Explorer:** https://explorer.oobeprotocol.ai/agent/8m5MXkunTGabXKLrmVCj2WekLF4V2WwB3gKGuAc872rx

---

## x402 Transaction Proof

- **31 on-chain transactions** — search (25) + chat (6)
- **53+ hours continuous operation** (2026-05-30 15:06 → 2026-06-01 20:24)
- Full list with Solscan links: [TRANSACTIONS.md](TRANSACTIONS.md)

---

## Demo Video

- **YouTube Link:** ___ (record and add before submission)
- **Segments to cover:**
  1. [ ] Agent registration on OOBE Explorer (`8m5MXkunT...`)
  2. [ ] Live PM2 process list (`pm2 list`)
  3. [ ] Signal appearing in terminal logs
  4. [ ] Signal posted to Telegram within minutes
  5. [ ] x402 transaction on Solscan
  6. [ ] `/api/proof` endpoint showing cumulative stats

---

## Submission Checklist

- [x] 48+ hours continuous operation (53h+)
- [x] 274 signals generated
- [x] 31 x402 on-chain transactions
- [x] 6 agents registered on SAP (`8m5MXkunT...`)
- [x] 112 Twitter posts
- [x] 274 Telegram messages distributed
- [ ] Twitter follower count added
- [ ] Telegram member count added
- [ ] Screenshots added
- [ ] Demo video recorded and uploaded to YouTube
- [ ] Bounty submission posted on OOBE Protocol website
