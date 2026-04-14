---
phase: 14-web-push-notifications
plan: 02
subsystem: push-api-dispatch
tags: [push-api, push-dispatch, ws-node, rest-endpoints, web-push]
dependency_graph:
  requires: [14-01]
  provides: [push-rest-api, push-ws-dispatch, push-respond-endpoint]
  affects: [14-03, 14-04]
tech_stack:
  added: []
  patterns: [asyncio-create-task-for-push-dispatch, upsert-by-endpoint, preference-filtering]
key_files:
  created:
    - server/backend/app/api/routes/push.py
    - server/backend/tests/test_push_service.py
    - server/backend/tests/test_push_routes.py
    - server/backend/tests/test_push_dispatch.py
  modified:
    - server/backend/app/api/main.py
    - server/backend/app/api/routes/ws_node.py
    - server/backend/app/models.py
decisions:
  - Push dispatch uses asyncio.create_task to avoid blocking the WS message loop
  - Subscribe endpoint upserts by endpoint+user_id for idempotent device registration
  - Project name derived from session cwd when not in message payload
metrics:
  duration_seconds: 265
  completed: "2026-04-13T17:12:57Z"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 14 Plan 02: Push REST API and WebSocket Dispatch Summary

Push REST API endpoints for subscribe/unsubscribe/preferences/VAPID-key/respond plus asyncio.create_task push dispatch in ws_node.py for permissionRequest and taskComplete events with per-type preference filtering.

## Task Results

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Push REST API endpoints and router registration | f74aac0 | Done |
| 2 | Push dispatch from ws_node.py, backend tests | cbfbe7f | Done |

## What Was Built

### Task 1: Push REST API Endpoints
- **push.py**: Created with 6 endpoints:
  - `GET /push/vapid-key` -- returns VAPID public key as PlainTextResponse
  - `POST /push/subscribe` -- upserts push subscription by endpoint+user_id (D-13)
  - `DELETE /push/subscribe` -- removes subscriptions (by endpoint or all)
  - `PATCH /push/preferences` -- updates notify_permissions/notify_completions on all subs (D-11)
  - `GET /push/subscriptions` -- lists user's subscriptions with truncated endpoints (T-14-07)
  - `POST /push/respond` -- routes permission response to node via ConnectionManager (D-01, Pitfall 2)
- **main.py**: Registered `push.router` in api_router

### Task 2: WebSocket Push Dispatch and Tests
- **ws_node.py**: Added push dispatch block after activity broadcast:
  - Dispatches on `permissionRequest` with sessionId, toolName, requestId, projectName
  - Dispatches on `taskComplete` with sessionId, projectName, costUsd
  - Uses `asyncio.create_task(send_push_to_user(...))` to avoid blocking WS handler (T-14-08)
  - Derives projectName from session cwd when not in message payload
- **test_push_service.py**: 3 tests -- permission request push, task complete push, preferences filter
- **test_push_routes.py**: 3 tests -- VAPID key endpoint, subscribe auth, respond auth
- **test_push_dispatch.py**: 2 tests -- permission request triggers push, task complete triggers push

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Restored UsageRecord model dropped during Plan 01**
- **Found during:** Task 2
- **Issue:** `UsageRecord` class was accidentally removed from `app/models.py` when PushSubscription models were added in Plan 01, causing ImportError in activity.py, usage.py, and ws_node.py
- **Fix:** Restored `UsageRecord` model definition at its original location (before Push models)
- **Files modified:** server/backend/app/models.py
- **Commit:** cbfbe7f

## Verification Results

- `from app.api.routes.push import router` -- OK (syntax valid)
- `push.router` registered in api/main.py -- OK
- `send_push_to_user` imported in ws_node.py -- OK
- `asyncio.create_task(send_push_to_user` in ws_node.py -- OK
- `push_payload["toolName"]` for permissionRequest -- OK
- `push_payload["costUsd"]` for taskComplete -- OK
- 8/8 tests pass (test_push_service: 3, test_push_routes: 3, test_push_dispatch: 2) -- OK

## Self-Check: PASSED

All 6 created/modified files verified on disk. Both task commits (f74aac0, cbfbe7f) found in git log.
