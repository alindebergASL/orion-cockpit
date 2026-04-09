# Orion Cockpit

A dashboard for interacting with a remote [OpenClaw](https://github.com/openclaw/openclaw) agent. Built to run on an Ubuntu/EC2 server connecting to an OpenClaw instance on a Mac Mini (or any reachable host).

## Tech Stack

- React 19 + TypeScript
- Vite 6
- Tailwind CSS 3
- Lucide React (icons)

## Features

### Chat

Real-time streaming conversation with your OpenClaw agent via SSE (`/v1/chat/completions`). Includes a **Canvas panel** on the right side that renders HTML content from OpenClaw's A2UI protocol — supports `surfaceUpdate`, `dataModelUpdate`, `beginRendering`, and `deleteSurface` events. Canvas is collapsible and expandable.

### Calendar

Displays upcoming events from shared calendars that OpenClaw is connected to (Google Calendar, CalDAV, macOS Reminders). Fetches events via `POST /tools/invoke` calling `calendar.list_events`. Includes a chat interface below for natural language calendar queries.

### Tasks

Shows open tasks tracked by OpenClaw, fetched via `POST /tools/invoke` calling `tasks.list`. Tasks are filterable by status (all / open / in progress / completed) and color-coded by priority.

### Notes

A local notes editor persisted to `localStorage`. Create, edit, and delete notes. This is a placeholder tab — future versions may integrate with OpenClaw's memory or a backend store.

## Prerequisites

- Node.js 18+
- An OpenClaw instance accessible over the network (see [Connectivity](#connectivity))

## Quick Start

```bash
git clone <repo-url> && cd orion-cockpit
npm install
cp .env.example .env
# Edit .env with your OpenClaw gateway URL and token
npm run dev
```

The dev server starts on `http://localhost:3000`.

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `VITE_OPENCLAW_URL` | OpenClaw gateway URL | `http://localhost:18789` |
| `VITE_OPENCLAW_TOKEN` | Bearer token for authentication | (empty) |

## OpenClaw API Endpoints Used

| Endpoint | Method | Purpose |
|---|---|---|
| `/v1/chat/completions` | `POST` | Streaming chat via SSE (`stream: true`) |
| `/v1/chat/completions` | `OPTIONS` | Health / connectivity check (30s interval) |
| `/tools/invoke` | `POST` | Direct tool invocation (calendar, tasks) |

## Connectivity

The dashboard needs network access to your OpenClaw gateway. Options:

**Reverse SSH tunnel** (simplest for testing)
```bash
# On the Mac Mini — forwards local OpenClaw port to the EC2 server
ssh -R 18789:localhost:18789 user@your-ec2-ip
```
Use `autossh` for automatic reconnection in production.

**Tailscale / WireGuard** (recommended for production)
Install on both machines. Gives the Mac Mini a stable private IP on a mesh VPN. Zero-config with Tailscale, more control with WireGuard.

**Cloudflare Tunnel**
Free tier available. No port forwarding needed, handles TLS. Run `cloudflared` on the Mac Mini pointing to `localhost:18789`.

All three options keep your Mac Mini's OpenClaw gateway unexposed to the public internet.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server on port 3000 |
| `npm run build` | Type-check and build for production (`dist/`) |
| `npm run preview` | Preview the production build locally |

## Project Structure

```
src/
├── main.tsx                       Entry point
├── App.tsx                        Root component with tab routing
├── config.ts                      OpenClaw URL + token from env
├── index.css                      Tailwind imports
├── types/index.ts                 Shared TypeScript types
├── lib/
│   └── openclaw.ts                OpenClaw API client (SSE, tools, ping)
├── hooks/
│   ├── useOpenClaw.ts             Client instance + connection status
│   └── useChat.ts                 Chat state, streaming, canvas events
└── components/
    ├── Layout.tsx                 Sidebar navigation + connection indicator
    ├── tabs/
    │   ├── ChatTab.tsx            Chat + canvas split view
    │   ├── CalendarTab.tsx        Calendar events + chat
    │   ├── TasksTab.tsx           Task list with filters
    │   └── NotesTab.tsx           Local notes editor
    └── chat/
        ├── MessageList.tsx        Chat message rendering
        ├── MessageInput.tsx       Input with send/stop controls
        └── CanvasPanel.tsx        Sandboxed iframe for A2UI content
```
