# Orion Cockpit

A personal/family dashboard powered by a multi-provider LLM backend with OpenClaw integration. Built for the Lindeberg household.

## Architecture

```
Browser (https://orion.lindeberg.us)
   |
   v
Nginx (EC2, HTTPS via Let's Encrypt)
   |
   v
Node.js Backend (Express, port 3001)
  |- JWT Auth + bcrypt
  |- Multi-provider LLM (Anthropic / OpenRouter / OpenAI)
  |- SQLite (users, calendar, tasks, chat, notes)
  |- Tool execution loop (calendar, tasks, OpenClaw)
  |- Auto-sync every 15 min
   |
   v
OpenClaw (Mac Mini via reverse SSH tunnel)
  |- Google Calendar + Tasks
  |- Home automation, etc.
```

## Tech Stack

**Frontend:**
- React 19 + TypeScript
- Vite 6
- Tailwind CSS 3 (dark/light theme)
- react-markdown + remark-gfm
- Lucide React (icons)

**Backend:**
- Express + TypeScript (tsx for dev)
- SQLite via better-sqlite3
- @anthropic-ai/sdk + openai SDK (multi-provider LLM)
- bcryptjs + jsonwebtoken (auth)

## Features

- **Multi-user auth** with JWT, admin panel for user management
- **Chat** with LLM (streaming SSE), conversation history (5 recent), search
- **Calendar** synced from Google via OpenClaw, week/month views, create events
- **Tasks** synced from Google Tasks, click-to-complete toggle, quick-add input
- **Notes** per-user, stored in SQLite
- **Home dashboard** with greeting, upcoming events, open tasks, daily briefing
- **Dark/light theme** toggle (persisted in localStorage)
- **Auto-sync** calendar + tasks every 15 minutes
- **Markdown rendering** in chat with code blocks, links, lists
- **Toast notifications** for sync status
- **Keyboard shortcuts**: Ctrl+1-5 for tabs, Ctrl+K for chat search
- **Mobile-responsive** sidebar

## Environment Variables (server/.env)

```bash
JWT_SECRET=your-secret

LLM_PROVIDER=openrouter        # anthropic | openai | openrouter | custom
LLM_API_KEY=sk-or-...
LLM_CHAT_MODEL=anthropic/claude-sonnet-4-6
LLM_REASONING_MODEL=anthropic/claude-opus-4-6
LLM_QUICK_MODEL=anthropic/claude-haiku-4-5-20251001

OPENCLAW_URL=http://localhost:8891
OPENCLAW_TOKEN=your-token

PORT=3001
```

## Setup

```bash
# Frontend
npm install

# Backend
cd server
npm install
cp .env.example .env   # fill in values
npm run seed -- andrew password Andrew   # create admin user

# Dev
npm run dev             # frontend on :3000 (proxies /api to :3001)
cd server && npm run dev  # backend on :3001

# Production
npm run build           # frontend
cd server && npm run build  # backend
node server/dist/index.js   # serves both frontend + API
```

## Deployment

```bash
git pull
npm install && cd server && npm install && npm run build && cd .. && npm run build
sudo systemctl restart orion-cockpit-server
```
