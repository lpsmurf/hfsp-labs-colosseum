---
name: polymarket-read
description: Read Polymarket prediction markets — search/list markets, current YES/NO odds, liquidity, resolution status, and the user's open positions. Demo layer on top of the bridge (Polymarket runs on Polygon). Use for "show Polymarket markets", "odds on <event>", "my Polymarket positions".
---

# polymarket-read

Read-only access to Polymarket (Polygon) via the CLOB API.

## Capabilities
- search/list active markets (by keyword/category)
- current odds (YES/NO price), liquidity, volume, end date
- resolution status
- user positions for a given EVM address

No bridge needed for reads. Run `scripts/polymarket.ts read ...`.
