---
name: polymarket-read
description: Read Polymarket prediction markets — search/list markets, current YES/NO odds, liquidity, resolution status, and the user's open positions. Demo layer on top of the bridge (Polymarket runs on Polygon). Use for "show Polymarket markets", "odds on <event>", "my Polymarket positions".
---

# polymarket-read

Read-only access to Polymarket (Polygon) via the public **Gamma API**. **LIVE.**

## Capabilities
- search/list active markets by keyword, ranked by volume
- current odds (per-outcome implied %), liquidity, volume, end date, `conditionId`

No bridge or funds needed for reads. Run `npm run polymarket read [keyword]`
(e.g. `npm run polymarket read worldcup`).
