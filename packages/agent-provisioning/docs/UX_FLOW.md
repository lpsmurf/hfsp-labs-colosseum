# UX Flow (Telegram) — current beta

## Main menu (persistent keyboard)
Buttons:
- Create agent
- My agents
- Status
- Cancel

Notes:
- Default path is **non-technical**.
- Dashboard/SSH details are **Advanced-only** (inline button).

## Create agent (wizard)
1) Agent name
2) BotFather helper + steps
3) Paste BotFather token
4) Paste bot username (@name or t.me/name)
5) Choose template: Blank | Ops Starter
6) Choose provider:
   - OpenAI (API key)
   - Claude (Anthropic) (API key)
   - Others (coming soon)
7) Paste API key
8) Choose model preset: Fast | Smart
9) Provision agent (creates isolated tenant runtime container)
10) Pairing (required):
   - user opens their bot and sends /start
   - bot shows pairing code
   - user pastes pairing code into storefront bot
   - storefront bot auto-approves inside tenant container

## Provisioning output (post-provision)
- Shows: Provisioned ✅ + pairing instructions + "Open your bot" button
- Shows: "Dashboard access (Advanced)" button (no commands shown unless tapped)

## Common user pitfalls + copy
- If user pastes their Telegram user id instead of the pairing code: remind them the pairing code is **8 chars**.
- If they reuse the same BotFather token across tenants: Telegram polling will conflict (409). Recommend creating a new bot per tenant.
