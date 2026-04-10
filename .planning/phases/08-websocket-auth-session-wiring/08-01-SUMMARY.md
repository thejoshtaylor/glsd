---
phase: "08-websocket-auth-session-wiring"
plan: "01"
subsystem: "server-backend, server-frontend"
tags: [websocket, auth, cookie, session, routing]
dependency_graph:
  requires: [phase-04, phase-05]
  provides: [cookie-conditional-secure, cwd-threading, session-route]
  affects: [login-endpoint, cloud-session-hook, frontend-routing, node-detail-page]
tech_stack:
  added: []
  patterns: ["conditional cookie secure flag", "cwd state threading", "lazy-loaded session route"]
key_files:
  created:
    - server/frontend/src/components/nodes/node-session-page.tsx
  modified:
    - server/backend/app/api/routes/login.py
    - server/frontend/src/hooks/use-cloud-session.ts
    - server/frontend/src/App.tsx
    - server/frontend/src/components/nodes/node-detail-page.tsx
decisions:
  - "Cookie secure=False only when ENVIRONMENT=='local'; staging/production remain secure=True"
  - "cwd threaded from createSession response through CloudSessionState into sendTask"
  - "useNavigate preferred over window.location.href for in-app session navigation"
  - "New Session button uses inline cwd input form rather than Dialog (simpler for single field)"
metrics:
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 4
---

# Phase 08 Plan 01: WebSocket Auth & Session Wiring Summary

Conditional cookie secure flag for local HTTP dev, cwd threading from createSession into sendTask, and /nodes/:nodeId/session route with New Session button on node detail page.

## What Was Done

### Task 1: Fix cookie secure flag and thread cwd in useCloudSession

**Cookie secure flag (CRIT-04, RELY-02):**
- Changed `secure=True` to `secure=(settings.ENVIRONMENT != "local")` in `login.py` line 67
- Local HTTP dev now receives the cookie on WS upgrade; staging/production remain secure
- `settings` was already imported; `ENVIRONMENT` defaults to `"local"` matching existing pattern in `config.py`

**cwd threading (CRIT-02, SESS-03):**
- Added `cwd: string` field to `CloudSessionState` interface
- Added `cwd: ''` to `initialState`
- In `createSession`, stored `session.cwd` (from `SessionPublic` REST response) into state
- In `sendTask`, changed `cwd: ''` to `cwd: prev.cwd ?? ''` so the real working directory is sent to the daemon

### Task 2: Create session page and wire route + New Session button

**NodeSessionPage (SESS-01, VIBE-02):**
- Created `node-session-page.tsx` with two modes:
  - When `?cwd=` query param present: renders `InteractiveTerminal` with nodeId and workingDirectory, filling available space
  - When absent: renders a form to enter an absolute path, then navigates with `useNavigate`
- Back-to-node link and cwd display in header bar

**Route registration:**
- Added lazy import for `NodeSessionPage` in `App.tsx`
- Added `<Route path="/nodes/:nodeId/session" element={<NodeSessionPage />} />` after the files route

**New Session button on node detail page:**
- Added `Plus` icon and `useState` imports
- Added `Input` component import
- "New Session" button appears only when node is online and not revoked
- Toggles an inline cwd input form that navigates to `/nodes/:nodeId/session?cwd=<encoded>`

## Verification Results

- `grep "settings.ENVIRONMENT" login.py` -- confirmed conditional secure flag at line 67
- `grep "cwd" use-cloud-session.ts` -- confirmed cwd in interface (28), initialState (126), createSession setState (295), sendTask (329)
- `node-session-page.tsx` exists and exports `NodeSessionPage`
- `App.tsx` has lazy import (line 33) and route (line 75) for `NodeSessionPage`
- `node-detail-page.tsx` has "New Session" button (line 210)
- Frontend TypeScript compiles with zero errors (`npx tsc --noEmit` clean)

## Deviations from Plan

None -- plan executed exactly as written.

## Requirements Satisfied

- **RELY-02**: Cookie secure flag conditional on ENVIRONMENT
- **SESS-03**: cwd from createSession response threaded into sendTask
- **SESS-01**: /nodes/:nodeId/session route renders InteractiveTerminal
- **VIBE-02**: Session flow accessible from node detail page via New Session button

## Known Stubs

None -- all data sources are wired (cwd from REST response, nodeId from URL params).

## Self-Check: PASSED

- [x] server/frontend/src/components/nodes/node-session-page.tsx -- FOUND
- [x] server/backend/app/api/routes/login.py -- modified, secure flag confirmed
- [x] server/frontend/src/hooks/use-cloud-session.ts -- modified, cwd threading confirmed
- [x] server/frontend/src/App.tsx -- modified, route and import confirmed
- [x] server/frontend/src/components/nodes/node-detail-page.tsx -- modified, New Session button confirmed
- [x] TypeScript compilation -- clean (zero errors)
