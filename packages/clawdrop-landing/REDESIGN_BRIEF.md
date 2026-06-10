# Clawdrop Landing — Redesign Brief (blockrun.ai style)

Target file: `packages/clawdrop-landing/index.html` (single self-contained static page, served by nginx — no build step).

---

## 1. Visual direction (reference: https://blockrun.ai)

- **Theme:** dark. Near-black base `#0A0B0D`, panels `#111316`, hairline borders `#1E2228`.
- **Text:** off-white `#E8EAED` headings, muted `#8A9099` body.
- **Accent:** Solana-leaning. Primary `#14F195` (mint/green) + secondary `#9945FF` (purple), used sparingly on CTAs, links, and a soft hero glow. One restrained gradient (`#14F195 → #9945FF`) on the H1 keyword.
- **Type:** geometric sans (Inter / Geist) for UI; mono (JetBrains Mono / Geist Mono) for code + numbers.
- **Texture:** terminal/code blocks with traffic-light dots, monospace CLI output, brand-logo row. Minimal imagery — typography + code carry it. Subtle radial glow behind hero, faint grid lines, generous whitespace.
- **Mood:** professional, developer-trustworthy. Trust line: "Your keys, your container. Never shared infrastructure."

---

## 2. Wireframe (section order)

```
┌──────────────────────────────────────────────────────────┐
│ NAV  Clawdrop◆     Product  Docs  Pricing  Token   [Launch]│
├──────────────────────────────────────────────────────────┤
│ HERO                          ⌁ soft mint/purple glow      │
│   While you sleep, your agent trades.   <- gradient keyword│
│   Per-user autonomous Solana AI agents, 24/7.              │
│   [ Start free trial ]   [ Read docs ]                     │
│                                                            │
│   ┌─ terminal ───────────────────────────┐                │
│   │ ● ● ●  clawdrop deploy                │                │
│   │ ✓ container spun  ✓ MCP live  ✓ funded│                │
│   │ agent online → trading on mainnet     │                │
│   └───────────────────────────────────────┘               │
├──────────────────────────────────────────────────────────┤
│ TRUST ROW  Solana · SendAI Agent Kit · Helius · Jupiter ·  │
│            Birdeye · MCP · Docker · x402   (logo strip)     │
├──────────────────────────────────────────────────────────┤
│ TWO STAGES (the core story)                                │
│   ┌── Stage 1: Free Trial ──┐  →  ┌── Stage 2: Deployed ──┐│
│   │ Chatbot in browser       │     │ 24/7 agent on Telegram││
│   │ Read-only devnet         │     │ Isolated Docker + MCP ││
│   │ Ask anything             │     │ Full DeFi, your keys  ││
│   └──────────────────────────┘     └───────────────────────┘│
├──────────────────────────────────────────────────────────┤
│ FEATURE GRID (3x2 cards)                                   │
│   • Isolated infra      • 60+ Solana protocols             │
│   • Keys never shared    • x402 pay-per-call               │
│   • Per-user MCP server  • SendAI Agent Kit tools          │
├──────────────────────────────────────────────────────────┤
│ HOW IT WORKS  (3 numbered steps)                           │
│   1 Try free  →  2 Subscribe  →  3 Agent deploys & runs    │
├──────────────────────────────────────────────────────────┤
│ PRICING  (3 tier cards: Shared / Dedicated / Custom)       │
│   monthly price · what's included · [Choose] — middle      │
│   tier "Most popular" highlighted with accent border       │
├──────────────────────────────────────────────────────────┤
│ TOKEN  $HERD — fund agents / governance                    │
│   [ Get $HERD (EasyA) ]   [ Swap on Jupiter ]              │
├──────────────────────────────────────────────────────────┤
│ FINAL CTA  "Deploy your agent." [ Start free trial ]       │
├──────────────────────────────────────────────────────────┤
│ FOOTER  4 columns: Product · Developers · Token · Social   │
│   App · Telegram bot · GitHub · NPM · $HERD · Jupiter      │
└──────────────────────────────────────────────────────────┘
```

---

## 3. Real links (must be wired)

- App: https://app.hfsp.cloud
- Telegram bot: https://t.me/hfsp_minibot
- GitHub: https://github.com/lpsmurf/hfsp-labs-colosseum
- NPM: https://npmjs.com/package/clawdrop-mcp
- $HERD (EasyA): https://kickstart.easya.io/token/6MX5VAf51UoLLuE3Shivje31baeoxUJNSgTNXYn8YX2R
- Jupiter swap: https://jup.ag/tokens/6MX5VAf51UoLLuE3Shivje31baeoxUJNSgTNXYn8YX2R
