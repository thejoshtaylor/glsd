---
phase: 14
fixed_at: 2026-04-13T00:00:00Z
review_path: .planning/phases/14-web-push-notifications/14-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 14: Code Review Fix Report

**Fixed at:** 2026-04-13
**Source review:** .planning/phases/14-web-push-notifications/14-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (CR-01, HR-01, HR-02)
- Fixed: 3
- Skipped: 0

## Fixed Issues

### CR-01: VAPID private key written to `.env` file in plaintext by server process

**Files modified:** `server/backend/app/core/push.py`
**Commit:** 070f697
**Applied fix:** Replaced the `ensure_vapid_keys()` implementation to never write keys to the filesystem. If VAPID keys are missing, the function now generates a key pair, emits a `logger.critical` message with the generated values, and raises `RuntimeError` directing the operator to set env vars and restart. The unused `from pathlib import Path` import was also removed. Module-level `_vapid_cache` is now populated on first successful key load to support the HR-01 async cache (see below).

### HR-01: Concurrent push dispatches race on `ensure_vapid_keys()` key generation

**Files modified:** `server/backend/app/core/push.py`
**Commit:** 070f697
**Applied fix:** Added module-level `_vapid_cache: tuple[str, str] | None = None` and `_vapid_lock = asyncio.Lock()`. Added `ensure_vapid_keys_async()` with double-checked locking: checks cache before acquiring the lock, acquires the lock, checks again, then delegates to the sync `ensure_vapid_keys()` which populates `_vapid_cache`. Updated `send_push_to_user` to call `await ensure_vapid_keys_async()` instead of the sync variant, eliminating the concurrent generation race.

### HR-02: `GET /push/vapid-key` is fully unauthenticated

**Files modified:** `server/backend/app/api/routes/push.py`, `server/backend/tests/test_push_routes.py`
**Commit:** b7375f0
**Applied fix:** Added `current_user: CurrentUser` parameter to the `get_vapid_key` route handler so FastAPI enforces authentication parity with all other push endpoints. Updated `test_get_vapid_key` to `test_get_vapid_key_requires_auth`, which asserts that an unauthenticated request to `GET /api/v1/push/vapid-key` returns 401 — correctly validating the new behaviour.

---

_Fixed: 2026-04-13_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
