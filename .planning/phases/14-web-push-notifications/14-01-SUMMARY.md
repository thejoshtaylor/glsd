---
phase: 14-web-push-notifications
plan: 01
subsystem: push-infrastructure
tags: [web-push, vapid, service-worker, pywebpush, alembic]
dependency_graph:
  requires: []
  provides: [push-subscription-model, vapid-config, push-dispatch-service, service-worker]
  affects: [14-02, 14-03, 14-04]
tech_stack:
  added: [pywebpush, py-vapid]
  patterns: [asyncio-to-thread-for-blocking-io, vapid-auto-generation, push-tag-dedup]
key_files:
  created:
    - server/backend/app/core/push.py
    - server/backend/app/alembic/versions/p14_001_add_push_subscription.py
    - server/frontend/public/sw.js
    - server/frontend/public/offline.html
  modified:
    - server/backend/pyproject.toml
    - server/backend/app/models.py
    - server/backend/app/core/config.py
decisions:
  - Used py_vapid for VAPID key generation with auto-write to .env
  - Service worker uses plain JS in public/ dir (not bundled by Vite)
  - Push tokens stored in SW memory map keyed by requestId for action button auth
metrics:
  duration_seconds: 161
  completed: "2026-04-13T17:06:08Z"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 14 Plan 01: Backend Push Foundation and Service Worker Summary

PushSubscription SQLModel table with Alembic migration, VAPID auto-generation via py_vapid, async push dispatch service using pywebpush with 410 cleanup, and service worker handling push/click/offline events with inline approve/deny actions.

## Task Results

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | PushSubscription model, migration, config, pywebpush dep, and push service | f4bcc32 | Done |
| 2 | Service worker with push event handling and notification actions | 4d819a5 | Done |

## What Was Built

### Task 1: Backend Push Infrastructure
- **pyproject.toml**: Added `pywebpush>=2.3.0,<3.0.0` dependency
- **models.py**: Added `PushSubscription` table model (id, user_id, endpoint, p256dh, auth, notify_permissions, notify_completions, created_at) plus `PushSubscribeRequest`, `PushPreferencesUpdate`, and `PushPermissionResponse` schemas
- **config.py**: Added `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_CONTACT_EMAIL` optional settings
- **core/push.py**: Created with `ensure_vapid_keys()` (generates via py_vapid and writes to .env if missing), `get_vapid_public_key()`, and `send_push_to_user()` (queries subscriptions respecting per-type prefs, sends via asyncio.to_thread, cleans up 410 expired subs, includes 5-min JWT action token in payload)
- **Alembic migration**: `p14_001_add_push_subscription.py` creates push_subscription table with user_id index, FK to user.id

### Task 2: Service Worker
- **sw.js**: Plain JavaScript service worker at `/sw.js` scope with:
  - Push event handler distinguishing `permissionRequest` (urgent, with approve/deny actions, requireInteraction) and `taskComplete` (informational) types
  - Tag-based deduplication per session
  - Notification click handler that calls `/api/v1/push/respond` with Bearer token from push payload for approve/deny actions
  - Error notification replacement on API call failure
  - Body-tap opens session page via `clients.openWindow`
  - Fetch handler for offline navigation fallback
  - Install with `skipWaiting` and offline page caching
  - Activate with `clients.claim`
- **offline.html**: Minimal dark-themed offline fallback page with retry button

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

- `from app.models import PushSubscription` -- OK
- `from app.core.push import ensure_vapid_keys, send_push_to_user, get_vapid_public_key` -- OK
- `settings.VAPID_PRIVATE_KEY` attribute exists -- OK
- `sw.js` contains all required event listeners and handlers -- OK
- `offline.html` exists -- OK
- Alembic migration file exists with push_subscription table creation -- OK

## Self-Check: PASSED

All 5 created files verified on disk. Both task commits (f4bcc32, 4d819a5) found in git log.
