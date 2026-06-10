# Build prompt — paste this into Claude / Claude Code

You are building the marketing landing page for **Clawdrop**. Build a single, self-contained, production-ready `packages/clawdrop-landing/index.html`. It is served as a static file by nginx — NO build step, NO npm. Use Tailwind via CDN + a small inline `<style>` block and a tiny vanilla `<script>` for scroll reveals and the mobile menu. No frameworks.

## Product (use this exact positioning)
Clawdrop deploys per-user autonomous Solana AI agents that run 24/7. Tagline: **"While you sleep, your agent trades."** Two stages: (1) a FREE trial chatbot in the browser (read-only devnet, SendAI Agent Kit), and (2) a PAID deployed agent — each subscriber gets their own isolated Docker container running their own MCP server, their private key (AES-GCM encrypted, never shared infra), full DeFi across 60+ Solana protocols via SendAI Agent Kit, with x402 pay-per-call payments. Built on: Solana, SendAI Agent Kit, Helius RPC, Jupiter, Birdeye, MCP, Docker, x402.

## Visual style — match https://blockrun.ai (dark, developer-grade)
- Dark theme. Base `#0A0B0D`, panels `#111316`, borders `#1E2228`. Text `#E8EAED` / muted `#8A9099`.
- Accent: Solana mint `#14F195` + purple `#9945FF`. Use a single `#14F195→#9945FF` gradient on the hero H1 keyword and CTA hover; keep accents restrained.
- Fonts: Inter (UI) + JetBrains Mono (code/numbers) from Google Fonts.
- Terminal/code blocks with traffic-light dots and monospace CLI output. Subtle radial hero glow, faint grid, lots of whitespace. Minimal imagery — typography + code carry it.
- Polished: rounded-xl cards, hairline borders, soft hover lift, fade/slide-in on scroll (IntersectionObserver), fully responsive, accessible (semantic landmarks, focus states, alt text), prefers-reduced-motion respected.

## Sections (in order)
1. Sticky nav: Clawdrop wordmark + diamond mark; links Product / Docs / Pricing / Token; primary "Launch app" button. Mobile hamburger.
2. Hero: H1 with "trades." as gradient keyword, subhead, two CTAs ([Start free trial] → app link, [Read docs] → GitHub), and a terminal mockup showing `clawdrop deploy` with ✓ steps (container spun, MCP live, funded, agent online).
3. Trust logo strip: Solana, SendAI Agent Kit, Helius, Jupiter, Birdeye, MCP, Docker, x402 (text/SVG chips are fine).
4. Two-stage block: side-by-side cards "Free Trial" → "Deployed Agent" with an arrow between.
5. Feature grid (6 cards): Isolated infrastructure · Keys never shared · Per-user MCP server · 60+ Solana protocols · x402 pay-per-call · SendAI Agent Kit tools.
6. How it works: 3 numbered steps (Try free → Subscribe → Agent deploys & runs 24/7).
7. Pricing: 3 tier cards (Shared / Dedicated / Custom). Middle = "Most popular" with accent border. Each: price, 4–5 bullets, CTA.
8. Token: $HERD section — fund agents / governance — buttons [Get $HERD (EasyA)] and [Swap on Jupiter].
9. Final CTA band: "Deploy your agent." + [Start free trial].
10. Footer: 4 columns (Product / Developers / Token / Social) using the real links below + small print.

## Links (wire exactly)
- App: https://app.hfsp.cloud
- Telegram: https://t.me/hfsp_minibot
- GitHub: https://github.com/lpsmurf/hfsp-labs-colosseum
- NPM: https://npmjs.com/package/clawdrop-mcp
- $HERD: https://kickstart.easya.io/token/6MX5VAf51UoLLuE3Shivje31baeoxUJNSgTNXYn8YX2R
- Jupiter: https://jup.ag/tokens/6MX5VAf51UoLLuE3Shivje31baeoxUJNSgTNXYn8YX2R

## Acceptance
Single `index.html` that renders standalone in a browser, no console errors, looks like a premium dark dev product (blockrun.ai-grade), mobile + desktop clean, all links correct. Write real benefit-driven copy — no lorem ipsum, no placeholder "[xxx]".
