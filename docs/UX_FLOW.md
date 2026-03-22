# UX Flow (Telegram)

## /start
Buttons:
- Create my agent
- My agents
- Help

## Create my agent (wizard)
1) Name your agent
2) Paste BotFather token
3) Choose template (Beta: keep <=2)
4) Choose model provider (Beta: OpenAI only initially)
5) Connect OpenAI:
   - OAuth (Beta) — OpenClaw `openai-codex` OAuth flow via web callback
   - API key (Recommended) — paste API key
6) Choose model preset: Fast / Smart
7) Provisioning status updates
8) Pairing: user DMs their bot → gets pairing code → pastes into storefront bot → approve inside tenant container
9) Live: show “help” + template-specific quickstart

## Copy (recommended)
- OAuth button label: "OAuth (Beta — may require API key fallback)"
- Failure copy: "OAuth didn’t complete for this runtime. Please paste an API key to continue."
