# Trial Frontend

React chatbox UI for Poly agent trial experience on Solana.

## Overview

- **Built by**: Codex
- **Architecture**: React 18 + Vite
- **Backend**: `/packages/trial-api` (Express SSE server)
- **Port**: 3000 (dev), configured to proxy to backend on 8787

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server (proxies /api/chat to localhost:8787)
npm run dev
# → http://localhost:3000/try

# Build for production
npm run build

# Type check
npm run typecheck
```

## Key Components

- **`src/hooks/useTrialChat.ts`** - SSE streaming, quota tracking, error handling
- **`src/components/Chatbox.tsx`** - Chat UI + message input
- **`src/components/MessageList.tsx`** - User/Poly message bubbles
- **`src/components/ToolCallCard.tsx`** - Tool result display
- **`src/components/PaywallModal.tsx`** - 10-message paywall
- **`src/pages/Try.tsx`** - Hero + chatbox layout

## Environment

```bash
# Dev (automatically points to localhost:8787)
npm run dev

# Production
VITE_TRIAL_CHAT_URL=https://clawdrop.live/api/chat npm run build
```

## Integration

Requires trial-api backend running:

```bash
cd ../trial-api
npm run dev  # :8787
```

Then in another terminal:

```bash
cd trial-frontend
npm run dev  # :3000
```

Visit http://localhost:3000/try

## Features

- ✅ Real-time SSE streaming
- ✅ Quota tracking (10 messages/day)
- ✅ Tool call visualization
- ✅ Error handling + retry
- ✅ Mobile-responsive (375px+)
- ✅ Dark mode
- ✅ No signup required

---

**Part of Colosseum Hackathon Build**
