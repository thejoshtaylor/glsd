---
phase: 12-usage-tracking
plan: 12-03
subsystem: server-backend, server-frontend
tags: [usage-tracking, session-detail, bug-fix, security]
dependency_graph:
  requires: [12-01, 12-02]
  provides: [session-usage-endpoint, session-detail-page]
  affects: [usage.py, ws_node.py, activity.py, session-redirect.tsx, usage-daily-chart.tsx]
tech_stack:
  added: []
  patterns: [user-ownership-enforcement, local-variable-capture-over-requery]
key_files:
  created: []
  modified:
    - server/backend/app/api/routes/usage.py
    - server/backend/app/api/routes/ws_node.py
    - server/backend/app/api/routes/activity.py
    - server/backend/tests/api/test_usage.py
    - server/frontend/src/pages/session-redirect.tsx
    - server/frontend/src/lib/api/usage.ts
    - server/frontend/src/components/usage/usage-daily-chart.tsx
    - server/frontend/src/App.tsx
decisions:
  - Return 404 (not 403) for other users' session usage to avoid confirming existence
  - Use pre-captured user_id local variable instead of re-querying ConnectionManager
metrics:
  duration: 4m14s
  completed: 2026-04-12T11:52:07Z
  tasks: 2/2
  files: 8
---

# Phase 12 Plan 03: Gap Closure -- Session Detail Page and Bug Fixes Summary

Session detail page at /sessions/:id with per-session cost breakdown (input_tokens, output_tokens, cost_usd, duration_ms) for completed sessions, plus three bug fixes: H-01 race condition in UsageRecord insert, M-01 timezone bug in daily chart, M-02 missing user_id filter in activity feed.

## What Was Done

### Task 1: Backend -- Session Usage Endpoint + Bug Fixes (TDD)

**New endpoint:** `GET /api/v1/usage/session/{session_id}` returns per-session usage data with user ownership enforcement. Returns 404 for non-existent records or records belonging to other users (T-12-06). Requires JWT authentication (T-12-07).

**H-01 fix (ws_node.py):** Replaced `manager.get_node(machine_id)` re-query with pre-captured `user_id` local variable from line 136. Eliminates race condition where ConnectionManager returns None during node disconnect, causing UsageRecord to be silently skipped.

**M-02 fix (activity.py):** Added `UsageRecord.user_id == current_user.id` filter to the batch query that enriches taskComplete activity events with cost data. Defense-in-depth: even if upstream session filter is bypassed, UsageRecord query independently enforces ownership.

**Tests:** 5 new tests added (test_get_session_usage_returns_data, test_get_session_usage_not_found, test_get_session_usage_other_user_returns_404, test_get_session_usage_unauthenticated, test_get_session_usage_invalid_uuid). All 27 usage tests pass.

### Task 2: Frontend -- Session Detail Page + Daily Chart Fix

**SessionDetailPage:** Replaced thin redirect component with full session detail page. Completed sessions show cost breakdown card with formatted token counts, cost, and duration. Active/pending sessions redirect to terminal launcher. Error sessions show error state. Back link to /usage.

**M-01 fix (usage-daily-chart.tsx):** Bare date strings (e.g., "2026-04-12") now parsed with `T00:00:00` suffix to treat as local time instead of UTC midnight, preventing off-by-one day labels in negative UTC offset timezones.

**API client:** Added `SessionUsageRecord` interface and `getSessionUsage` fetch function to usage.ts.

**App.tsx:** Updated lazy import and route from `SessionRedirectPage` to `SessionDetailPage`.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 (RED) | b10e0d3 | test(12-03): add failing tests for session usage endpoint |
| 1 (GREEN) | ddf3906 | feat(12-03): add session usage endpoint + fix H-01 race condition + M-02 user filter |
| 2 | 1cf9d5a | feat(12-03): session detail page + daily chart timezone fix + API client |

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

- `python -m pytest tests/api/test_usage.py -x -q`: 27 passed
- `pnpm exec tsc --noEmit`: clean (exit 0)
- `pnpm exec vite build`: built in 3.36s (exit 0)
- ws_node.py uses `uuid.UUID(user_id)` (not `manager.get_node(machine_id)`) in UsageRecord insert
- activity.py contains `UsageRecord.user_id == current_user.id` in batch query
- usage-daily-chart.tsx contains `T00:00:00` in date parsing
- session-redirect.tsx exports `SessionDetailPage` with cost fields for completed sessions
- App.tsx imports and routes to `SessionDetailPage`

## Threat Surface Scan

No new threat surfaces introduced beyond those already covered in the plan's threat model. All four mitigations (T-12-06 through T-12-09) implemented and tested.
