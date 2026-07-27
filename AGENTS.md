# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

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
- `pages/` — full-page views: Dashboard, Tasks, TaskCard, Team, EngineerCard, Gantt, Absences, Estimate, Reports, Notes
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
- `absences.ts` — `getAbsencePeriods`: reconstructs absence timeline (vacation/sick/dayoff) from `HistoryEntry[]` + current engineer status; used by Absences page
- `notes.ts` — `useNotes` hook + `Note` types; persists to **localStorage** (`omg_notes`), not the backend
- `ids.ts` — `genId(prefix)`

**Backend** (`server/`) — Express on port 3001
- `index.js` — five endpoints: `GET/POST /api/data`, `POST /api/save-seed`, `POST /api/seed`, `GET /api/health`
- `db.js` — reads/writes `server/data.json`; optional `server/seed.json` for user-saved snapshot
- No database — single JSON file is the entire data store

**Data model** — `Workspace` (top-level) contains `projects[]` + `currentProjectId`. Each `Project` has `engineers[]`, `tasks[]`, `history[]`, and optionally `estimateTemplates[]`. `EstimateTemplate` stores PERT-style estimate forms (optimistic/median/pessimistic per field). Frontend fetches the full `Workspace` on load and POSTs it on every save. **Exception**: `Notes` data lives only in `localStorage` and is never sent to the backend.

## Key behaviours

- **Auto-save** — debounced 800ms inside `App.tsx`. All mutations go through `updateData(fn: ProjectState → ProjectState)`, which only touches the current project inside the workspace. Never bypass state lift-up.
- **Forecast engine** — `calcForecast` runs a day-by-day simulation (`projectFinish`) that accounts for future vacations/dayoffs. Touch carefully — the date math is load-bearing. `computeDynamicStarts` chains parent→child start dates using `calcScheduledChildStart`.
- **Used hours (actual progress)** — `computeUsedHours(task, engineers, history)` is the single source of «выполнено». Two decoupled axes: (1) task membership per day from real `switch`/`return` events; (2) availability per day from `getAbsencePeriods` (absences are engineer-level, not task-coupled). A `switch` event's optional `dayFraction` (0..1, share of the switch day on the *leaving* task) splits the boundary day; absent/0 ⇒ whole switch day to the new task (legacy behaviour, keeps old data identical). Only past days (≤ yesterday) count. `calcForecast`/`engineersNeeded`/`calcPhaseInfo` take an optional `history` arg — pass `data.history` from pages, omit it to fall back to the simple `elapsed × current_team` formula.
- **Inherited team** — child tasks inherit their parent's engineers when `assignedEngineers` is empty (`computeInheritedTeam`). The Gantt and Reports pages both depend on this.
- **Effective deadlines** — `computeEffectiveDls` propagates the chain's maximum deadline back through parent tasks; leaf tasks get the hard deadline, parents get a soft backward-calculated one.
- **Theme** — CSS custom properties on `<html data-theme="dark|light">`. All colors are in `src/index.css` variables; never use hardcoded hex colours in new UI code (they break dark mode). Exception: the Reports PDF capture path uses hardcoded hex because `html2canvas` doesn't resolve CSS vars.
- **Proxy** — `package.json` has `"proxy": "http://localhost:3001"`; `.env` sets `HOST=0.0.0.0 PORT=4000`.
- **Reports / PDF** — `src/pages/Reports.tsx` uses `html2canvas + jsPDF`. SVG `<marker>` is not supported by html2canvas — use inline `<polygon>` for arrowheads. `overflow: hidden` on the capture container clips SVG arrows; keep it absent.
- **Russian holidays** — 2025 and 2026 calendars are hardcoded in `dates.ts`. When adding 2027+, extend `ALL_HOLIDAYS` there.
- **Notes isolation** — `Notes` page renders as `<Notes/>` with no props (unlike every other page which gets `PageProps`). Its data lives in `localStorage` only and is project-agnostic.
- **Absences page** — timeline view of engineer absences per month. Uses `getAbsencePeriods` to merge history + current status. Colours bars by engineer's `regularTask` direction using a deterministic hash palette.

## Coding conventions

- **CSS variables only** — never use hardcoded hex/rgb colours in React inline styles or CSS. All colours live in `src/index.css` as `var(--...)`. The only exception is code that feeds `html2canvas` (PDF export in Reports), where CSS vars are not resolved.
- **Styling** — all UI uses inline `style={{}}` objects; there is no CSS-modules or styled-components. New components follow the same pattern.
- **No new pages without registering** — adding a page requires: (1) add `NavTarget` union member in `ui-types.ts`, (2) add `NavItem` entry in `Sidebar.tsx`, (3) add conditional render in `App.tsx`.
- **Changelog** — after shipping a user-visible feature, add an entry to `src/changelog.json` (array prepend, version bump, `YYYY-MM-DD` date, Russian-language change descriptions).
- **`npm install` peer-dep conflict** — TypeScript 6.0.3 conflicts with `react-scripts@5.0.1` peer expectation of `^3‖^4`. Always pass `--legacy-peer-deps` when installing new packages.

## Workflow

- **Language** — always respond in Russian. Code identifiers, comments in new code, and technical terms stay in English.
- **Git push** — after every `git commit`, immediately run `git push` without asking for confirmation.
