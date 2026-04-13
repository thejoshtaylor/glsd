---
phase: 15
fixed_at: 2026-04-13T00:00:00Z
review_path: .planning/phases/15-redis-multi-worker-and-deploy-modal/15-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 15: Code Review Fix Report

**Fixed at:** 2026-04-13
**Source review:** .planning/phases/15-redis-multi-worker-and-deploy-modal/15-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3
- Fixed: 3
- Skipped: 0

## Fixed Issues

### HR-01: Redis connection leak — new client per request in `pairing.py`

**Files modified:** `server/backend/app/core/pairing.py`
**Commit:** 71bf54a
**Applied fix:** Replaced the per-call `aioredis.from_url()` pattern with a module-level singleton (`_redis_client`, `_redis_initialized`). `get_redis()` now lazily initializes once, pings to validate the connection, and returns the same client on every subsequent call — matching the pattern already used in `connection_manager.py`.

### HR-02: Race condition between lock-free read and locked write in revoke flow

**Files modified:** `server/backend/app/api/routes/nodes.py`
**Commit:** 19b3802
**Applied fix:** Wrapped the session-ID enumeration and browser dict snapshot inside `async with manager._lock:` so both reads are atomic with respect to concurrent `bind_session_to_node`, `unbind_session`, and `register_browser` calls. The notification loop runs after releasing the lock using the captured snapshot, avoiding holding the lock during I/O.

### HR-03: Unhandled promise rejection in `handleGenerate`

**Files modified:** `server/frontend/src/components/nodes/deploy-node-modal.tsx`
**Commit:** 55797a0
**Applied fix:** Wrapped the `generateCode.mutateAsync(...)` call in a try/catch block. On error, `toast.error("Failed to generate pairing code. Please try again.")` is shown to the user and the rejection is consumed, preventing it from propagating as an unhandled promise rejection through the `void handleGenerate()` call sites.

---

_Fixed: 2026-04-13_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
