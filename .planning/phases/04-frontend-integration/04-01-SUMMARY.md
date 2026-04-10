---
phase: "04"
plan: "01"
subsystem: "frontend-integration"
tags: [backend, frontend, tauri-removal, projects-api, cookie-auth, protocol-types]
dependency_graph:
  requires: ["03-01", "03-02"]
  provides: ["projects-rest-api", "cookie-auth-endpoints", "tauri-free-frontend", "project-selector-server-api"]
  affects: ["server/backend", "server/frontend"]
tech_stack:
  added:
    - "SQLModel Project model with user ownership (T-04-20)"
    - "FastAPI /projects CRUD routes"
    - "Alembic migration for projects table"
    - "POST /login/cookie + GET /me + POST /logout endpoints"
    - "lib/api/client.ts — fetch wrapper with cookie credentials"
    - "lib/api/auth.ts, nodes.ts, sessions.ts, projects.ts"
    - "lib/api/ws.ts — GsdWebSocket class with exponential backoff reconnect"
    - "lib/protocol.ts — TypeScript discriminated union for all 16+ message types"
    - "useNodes, useSessions, useRevokeNode, useServerProjects React Query hooks"
  patterns:
    - "Cookie-based JWT auth (httpOnly, secure, samesite=lax)"
    - "All @tauri-apps/* replaced with console.warn inline stubs"
    - "Vite proxy /api -> FastAPI, /ws -> FastAPI WebSocket"
    - "Generic <T,> trailing comma disambiguation in .tsx files"
key_files:
  created:
    - server/backend/app/api/routes/projects.py
    - server/backend/app/alembic/versions/c1d2e3f4a5b6_add_projects_table.py
    - server/frontend/src/lib/api/client.ts
    - server/frontend/src/lib/api/auth.ts
    - server/frontend/src/lib/api/nodes.ts
    - server/frontend/src/lib/api/sessions.ts
    - server/frontend/src/lib/api/projects.ts
    - server/frontend/src/lib/api/ws.ts
    - server/frontend/src/lib/protocol.ts
  modified:
    - server/backend/app/models.py
    - server/backend/app/api/main.py
    - server/backend/app/api/routes/login.py
    - server/backend/app/api/routes/ws_browser.py
    - server/frontend/package.json
    - server/frontend/vite.config.ts
    - server/frontend/src/lib/tauri.ts
    - server/frontend/src/lib/queries.ts
    - server/frontend/src/components/shared/project-selector.tsx
    - "10 additional files: direct @tauri-apps imports stubbed (Rule 1 auto-fix)"
decisions:
  - "Cookie auth (httpOnly) chosen over Authorization header — browser WebSocket API cannot set headers"
  - "useServerProjects unwraps paginated response data array before returning to consumers"
  - "ProjectSelector migrated to useServerProjects; other useProjects callers remain on tauri stubs pending full migration"
  - "Alembic migration written manually — no live DB available during plan execution"
  - "Generic functions in .tsx files require <T,> trailing comma to avoid JSX parse ambiguity"
metrics:
  duration: "~3 hours (across two sessions)"
  completed: "2026-04-09"
  tasks_completed: 4
  tasks_total: 4
  files_created: 9
  files_modified: 26
---

# Phase 4 Plan 01: Frontend Integration Foundation Summary

**One-liner:** Cookie-based JWT auth endpoints, full lib/api/* REST layer, Tauri IPC removal with console.warn stubs, and ProjectSelector migrated to server Projects API.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Projects backend resource | 5f68595 | models.py, routes/projects.py, migration |
| 2 | Cookie auth + API client + protocol types | 1c0cb01 | routes/login.py, lib/api/*, lib/protocol.ts |
| 3 | Gut tauri.ts + remove Tauri packages + Vite config | 6e25d47 | tauri.ts, package.json, vite.config.ts, 10 source files |
| 4 | Update ProjectSelector to server API | cb359c7 | project-selector.tsx, queries.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Direct @tauri-apps imports in 10 source files beyond tauri.ts**
- **Found during:** Task 3, during `pnpm build` after removing packages
- **Issue:** 10 files had direct `import { ... } from '@tauri-apps/...'` bypassing tauri.ts abstraction
- **Fix:** Replaced each import with an inline console.warn stub matching the same API signature
- **Files modified:**
  - `src/components/dashboard/project-card.tsx` — `@tauri-apps/plugin-shell` open stub
  - `src/components/error-boundary.tsx` — `@tauri-apps/api/core` invoke stub
  - `src/components/knowledge/knowledge-viewer.tsx` — `@tauri-apps/api/event` listen stub
  - `src/components/project/dependency-alerts-card.tsx` — `@tauri-apps/api/event` listen stub (required `<T,>` generic syntax)
  - `src/components/project/github-panel.tsx` — `@tauri-apps/plugin-shell` open stub
  - `src/components/project/gsd2-chat-tab.tsx` — UnlistenFn type re-export from lib/tauri
  - `src/components/project/gsd2-reports-tab.tsx` — `@tauri-apps/plugin-shell` open stub
  - `src/components/projects/project-card.tsx` — `@tauri-apps/plugin-shell` open stub
  - `src/hooks/use-close-warning.ts` — `@tauri-apps/api/window` getCurrentWindow stub
  - `src/hooks/use-gsd-file-watcher.ts` — `@tauri-apps/api/event` listen stub
  - `src/hooks/use-headless-session.ts` — UnlistenFn type re-export from lib/tauri
- **Commit:** 6e25d47

**2. [Rule 1 - Bug] TS6133 unused variable in GsdWebSocket**
- **Found during:** Task 2
- **Issue:** `currentChannelId` field declared in GsdWebSocket class but never read; caused TS error
- **Fix:** Removed unused field and its assignments in connect() and disconnect()
- **Files modified:** `src/lib/api/ws.ts`
- **Commit:** 1c0cb01

**3. [Rule 1 - Bug] JSX generic syntax in .tsx files**
- **Found during:** Task 3 (dependency-alerts-card.tsx stub insertion)
- **Issue:** `const listen = <T>(...)` parsed as JSX opening tag in .tsx context
- **Fix:** Changed to `<T,>` (trailing comma) to disambiguate as TypeScript generic
- **Files modified:** `src/components/project/dependency-alerts-card.tsx`, `src/components/knowledge/knowledge-viewer.tsx`
- **Commit:** 6e25d47

**4. [Rule 1 - Bug] onCloseRequested handler typed as `unknown`**
- **Found during:** Task 3 build
- **Issue:** `event` parameter in `onCloseRequested` callback was implicitly `any` (TS7006)
- **Fix:** Typed handler parameter as `(event: { preventDefault: () => void }) => Promise<void>`
- **Files modified:** `src/hooks/use-close-warning.ts`
- **Commit:** 6e25d47

## Known Stubs

All functions in `server/frontend/src/lib/tauri.ts` are stubs returning empty values. This is intentional — the migration from Tauri IPC to server REST API is incremental. The following stubs will be wired to actual server endpoints in subsequent plans:

- `listProjects` / `getProject` — superseded by `useServerProjects` for ProjectSelector; remaining callers pending migration
- All GSD-1/GSD-2 functions (gsdGetState, gsdListTodos, gsd2*, etc.) — to be wired via `/api/gsd/*` endpoints in a future plan
- PTY / terminal functions — to be wired via WebSocket relay in a future plan
- GitHub functions — to be wired via `/api/github/*` endpoints in a future plan

## Self-Check

### Created files exist:
- server/frontend/src/lib/api/client.ts — FOUND
- server/frontend/src/lib/api/auth.ts — FOUND
- server/frontend/src/lib/api/nodes.ts — FOUND
- server/frontend/src/lib/api/sessions.ts — FOUND
- server/frontend/src/lib/api/projects.ts — FOUND
- server/frontend/src/lib/api/ws.ts — FOUND
- server/frontend/src/lib/protocol.ts — FOUND
- server/backend/app/api/routes/projects.py — FOUND
- server/backend/app/alembic/versions/c1d2e3f4a5b6_add_projects_table.py — FOUND

### Commits exist:
- 5f68595 — Task 1
- 1c0cb01 — Task 2
- 6e25d47 — Task 3
- cb359c7 — Task 4

## Self-Check: PASSED
