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

npm run build         # production build of frontend (also type-checks via CRA)
npx tsc --noEmit      # type-check only, no emit
```

No test runner is configured. Manual UI testing is the primary approach.

## Architecture

Two independent Node.js processes:

**Frontend** (`src/`) — Create React App, React 18, **TypeScript** (`moduleResolution: bundler`, strict)
- `App.tsx` — root state; owns all data, routing, theme toggle, 800ms debounced auto-save, and multi-project workspace
- `pages/` — full-page views: Dashboard, Tasks, TaskCard, Team, EngineerCard, Gantt, Estimate, Reports
- `components/` — Sidebar (nav + changelog + project switcher), Topbar, UI (shared primitives)
- `ui-types.ts` — `NavTarget`, `PageProps`, `NavigateFn`, `UpdateProjectData`
- `vendor.d.ts` — type stubs for `html2canvas` and `jspdf` (needed because `moduleResolution: bundler` doesn't resolve their `typings` field)

**Domain layer** (`src/domain/`) — pure functions, no React, no side effects:
- `types.ts` — all domain types: `Engineer`, `Task`, `Project`, `Workspace`, `HistoryEntry`
- `availability.ts` — `isAvailableOn`, `capacityOn`, `capacityToday`, `isWorkingRole`, `roleCoeff`, `leaveTypeOn`
- `gantt.ts` — `computeInheritedTeam`, `computeDynamicStarts`, `segmentByWeek`, `arrowAnchorOffset`
- `engineer.ts` / `task.ts` — pure state-transition functions for engineer and task mutations
- `tasks.ts` — static reference data (REGULAR_TASKS list)

**Utils** (`src/utils/`):
- `forecast.ts` — core scheduling engine: `calcForecast`, `projectFinish`, `computeEffectiveDls`, `statusColor`, `fmtHours`
- `dates.ts` — Russian production calendar 2025–2026 (holidays hardcoded), `getMonthDays`, `isWorkday`, `addWorkdays`
- `storage.ts` — all fetch calls to the backend API
- `ids.ts` — `genId(prefix)`

**Backend** (`server/`) — Express on port 3001
- `index.js` — five endpoints: `GET/POST /api/data`, `POST /api/save-seed`, `POST /api/seed`, `GET /api/health`
- `db.js` — reads/writes `server/data.json`; optional `server/seed.json` for user-saved snapshot
- No database — single JSON file is the entire data store

**Data model** — `Workspace` (top-level) contains `projects[]` + `currentProjectId`. Each `Project` has `engineers[]`, `tasks[]`, `history[]`. Frontend fetches the full `Workspace` on load and POSTs it on every save.

## Key behaviours

- **Auto-save** — debounced 800ms inside `App.tsx`. All mutations go through `updateData(fn: ProjectState → ProjectState)`, which only touches the current project inside the workspace. Never bypass state lift-up.
- **Forecast engine** — `calcForecast` runs a day-by-day simulation (`projectFinish`) that accounts for future vacations/dayoffs. Touch carefully — the date math is load-bearing. `computeDynamicStarts` chains parent→child start dates using `calcScheduledChildStart`.
- **Inherited team** — child tasks inherit their parent's engineers when `assignedEngineers` is empty (`computeInheritedTeam`). The Gantt and Reports pages both depend on this.
- **Effective deadlines** — `computeEffectiveDls` propagates the chain's maximum deadline back through parent tasks; leaf tasks get the hard deadline, parents get a soft backward-calculated one.
- **Theme** — CSS custom properties on `<html data-theme="dark|light">`. All colors are in `src/index.css` variables; never use hardcoded hex colours in new UI code (they break dark mode). Exception: the Reports PDF capture path uses hardcoded hex because `html2canvas` doesn't resolve CSS vars.
- **Proxy** — `package.json` has `"proxy": "http://localhost:3001"`; `.env` sets `HOST=0.0.0.0 PORT=4000`.
- **Reports / PDF** — `src/pages/Reports.tsx` uses `html2canvas + jsPDF`. SVG `<marker>` is not supported by html2canvas — use inline `<polygon>` for arrowheads. `overflow: hidden` on the capture container clips SVG arrows; keep it absent.
- **Russian holidays** — 2025 and 2026 calendars are hardcoded in `dates.ts`. When adding 2027+, extend `ALL_HOLIDAYS` there.
