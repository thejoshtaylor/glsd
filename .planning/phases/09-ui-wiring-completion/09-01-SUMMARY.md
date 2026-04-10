---
phase: 09-ui-wiring-completion
plan: "01"
subsystem: server-frontend
tags: [ui, reconnection, routing, cleanup]
dependency_graph:
  requires: []
  provides: [reconnection-banner-wired, session-redirect-route, first-launch-wizard-deleted]
  affects: [server/frontend/src/components/terminal/interactive-terminal.tsx, server/frontend/src/App.tsx, server/frontend/src/pages/session-redirect.tsx]
tech_stack:
  added: []
  patterns: [lazy-route, react-query-redirect, conditional-banner]
key_files:
  created:
    - server/frontend/src/pages/session-redirect.tsx
  modified:
    - server/frontend/src/components/terminal/interactive-terminal.tsx
    - server/frontend/src/App.tsx
  deleted:
    - server/frontend/src/components/onboarding/first-launch-wizard.tsx
    - server/frontend/src/components/onboarding/__tests__/first-launch-wizard.test.tsx
    - server/frontend/src/components/onboarding/index.ts
decisions:
  - "ReconnectionBanner visibility gated on sessionId !== null to distinguish reconnect from initial connect"
  - "SessionRedirectPage uses Navigate replace so back button returns to activity feed"
  - "first-launch-wizard deleted entirely (no web replacement needed — Tauri-era stub)"
metrics:
  duration_minutes: 2
  completed_date: "2026-04-10"
  tasks_completed: 3
  files_changed: 6
requirements_satisfied: [RELY-05, VIBE-06]
---

# Phase 09 Plan 01: UI Wiring Completion Summary

**One-liner:** Wired ReconnectionBanner into InteractiveTerminal with reconnect-only visibility, added /sessions/:id redirect route resolving activity feed dead-ends, and deleted three Tauri-era first-launch-wizard stub files.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Wire ReconnectionBanner into InteractiveTerminal | a802459 | interactive-terminal.tsx |
| 2 | Add /sessions/:id redirect route for activity feed click-through | ab69a72 | session-redirect.tsx (new), App.tsx |
| 3 | Delete first-launch-wizard Tauri stub files | 7b44b47 | 3 files deleted |

## What Was Built

**Task 1 — ReconnectionBanner wiring:**
- Added `import { ReconnectionBanner } from '@/components/session/reconnection-banner'` to interactive-terminal.tsx
- Rendered `<ReconnectionBanner>` as first child inside the outer relative div, before `TerminalSearchBar`
- Visibility condition: `(state.connectionState === 'connecting' || state.connectionState === 'replaying') && state.sessionId !== null`
- The `sessionId !== null` guard ensures the banner only appears during RE-connection (after a session was established), not during initial connect where the existing Loader2 overlay handles that state

**Task 2 — Session redirect route:**
- Created `server/frontend/src/pages/session-redirect.tsx`: thin page that calls `getSession(id)` via React Query, then `<Navigate to="/nodes/:nodeId/session" replace />`
- Loading state: centered Loader2 spinner
- Error state: centered AlertCircle with error message
- Added lazy import and `<Route path="/sessions/:id">` inside the inner protected Routes block in App.tsx
- ActivitySidebar already navigates to `/sessions/${sessionId}` — this new route catches those clicks and resolves them to the correct node session page

**Task 3 — Tauri stub deletion:**
- Deleted `first-launch-wizard.tsx` (628 lines — Tauri IPC-dependent onboarding wizard)
- Deleted `__tests__/first-launch-wizard.test.tsx` (test for the deleted component)
- Deleted `onboarding/index.ts` (barrel export with only `FirstLaunchWizard`)
- Verified no external consumers before deletion via grep

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All three changes are fully wired:
- ReconnectionBanner renders with correct live state from useCloudSession
- SessionRedirectPage fetches real session data and redirects to real route
- Deleted files have no replacement stubs

## Verification

1. `grep -n "ReconnectionBanner" server/frontend/src/components/terminal/interactive-terminal.tsx` — shows import (line 20) and JSX usage (line 430)
2. `grep -n "sessions/:id" server/frontend/src/App.tsx` — shows route registered (line 77)
3. `test ! -f server/frontend/src/components/onboarding/first-launch-wizard.tsx` — returns 0 (ALL_DELETED)
4. `cd server/frontend && npx tsc --noEmit` — compiles with no errors

## Self-Check: PASSED

- `/Users/josh/code/glsd/server/frontend/src/pages/session-redirect.tsx` — FOUND
- `/Users/josh/code/glsd/server/frontend/src/components/terminal/interactive-terminal.tsx` — FOUND (modified)
- `/Users/josh/code/glsd/server/frontend/src/App.tsx` — FOUND (modified)
- Commits a802459, ab69a72, 7b44b47 — all present in git log
- Deleted files confirmed absent
- TypeScript compilation: no errors
