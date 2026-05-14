# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**OMG (Oh My Gantt)** — React-based project management and Gantt scheduling tool for engineering teams, with Russian holiday/workday support.

## Commands

```bash
# Root-level (runs both frontend + backend concurrently)
npm install           # install root deps; also run npm install inside server/
npm start             # start React (port 4000) + Express (port 3001) together

# Individual processes
npm run client        # React only (needs backend running)
npm run server        # Express only

npm run build         # production build of frontend
```

No test runner is configured. Manual UI testing is the primary approach.

## Architecture

Two independent Node.js processes:

**Frontend** (`src/`) — Create React App (React 18, plain CSS, no TypeScript)
- `App.js` — root state holder; owns all data, routing, theme toggle, and the 800ms debounced auto-save
- `pages/` — full-page views: Dashboard, Tasks, TaskCard, Team, EngineerCard, Gantt, Estimate
- `components/` — Sidebar (nav + changelog), Topbar, UI (shared primitives)
- `utils/storage.js` — all fetch calls to the backend API
- `utils/forecast.js` — core scheduling engine: effective capacity by role, workday iteration, dependent-task chaining
- `utils/dates.js` — Russian production calendar (2025–2026 holidays hardcoded)

**Backend** (`server/`) — Express on port 3001
- `index.js` — five endpoints: `GET/POST /api/data`, `POST /api/save-seed`, `POST /api/seed`, `GET /api/health`
- `db.js` — reads/writes `server/data.json`; optional `server/seed.json` for a user-saved snapshot
- No database — single JSON file is the entire data store

**Data model** — one flat JSON object with top-level arrays: `engineers`, `tasks`, `history`. Frontend fetches it all on load and POSTs the full object on every save.

## Key behaviors to keep in mind

- **Auto-save** is debounced 800ms inside `App.js` — changes are local state until flushed; avoid patterns that bypass the state lift-up.
- **Forecast engine** (`utils/forecast.js`) uses role-based capacity coefficients (lead/responsible/engineer/intern) and skips weekends + Russian public holidays. Touch this carefully; the date math is load-bearing.
- **Dependent tasks** — parent task's computed end date propagates as the child's start date automatically.
- **Theme** — CSS custom properties toggled via `data-theme` attribute on `<html>`; all colors live in `src/index.css` variables.
- **Proxy** — `package.json` has `"proxy": "http://localhost:3001"` so frontend fetch calls to `/api/*` route to the backend; the `.env` sets `HOST=0.0.0.0 PORT=4000`.
