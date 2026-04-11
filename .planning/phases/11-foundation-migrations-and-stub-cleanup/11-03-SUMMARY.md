---
phase: 11-foundation-migrations-and-stub-cleanup
plan: "03"
subsystem: api
tags: [email, fastapi, smtp, error-handling, python]

# Dependency graph
requires:
  - phase: 11-foundation-migrations-and-stub-cleanup
    provides: Plans 11-01 (migrations) and 11-02 (stub cleanup) complete
provides:
  - Hardened send_email() with explicit ValueError/RuntimeError raising
  - HTTP 503/502 surfacing on /utils/test-email/ endpoint
  - Anti-enumeration safe error logging in password recovery
  - Test coverage for all email error paths (FIX-03)
affects: [13-email-auth-flows]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Email error handling: send_email raises ValueError (not configured) or RuntimeError (SMTP failure); callers choose log-only or HTTPException based on security context"
    - "Anti-enumeration pattern: password recovery always returns 200; email errors are logged server-side only"
    - "Non-critical side effect pattern: user creation succeeds even if welcome email fails"

key-files:
  created:
    - server/backend/tests/test_email.py
  modified:
    - server/backend/app/utils.py
    - server/backend/app/api/routes/login.py
    - server/backend/app/api/routes/users.py
    - server/backend/app/api/routes/utils.py

key-decisions:
  - "send_email raises ValueError (not configured) and RuntimeError (SMTP failure) — callers decide HTTP response"
  - "password-recovery endpoint logs errors silently (anti-enumeration: always returns 200)"
  - "user creation logs email errors but never blocks user creation"
  - "test-email endpoint raises HTTP 503/502 (it is explicitly for SMTP config testing)"
  - "assert replaced with explicit if-check (assert stripped in Python -O optimized mode)"

patterns-established:
  - "Email error pattern: raise in utility, catch in route with context-appropriate response"
  - "Anti-enumeration: auth endpoints absorb email errors, non-auth endpoints surface them"

requirements-completed: [FIX-03]

# Metrics
duration: 3min
completed: 2026-04-11
---

# Phase 11 Plan 03: Email Error Handling Summary

**send_email() hardened with explicit ValueError/RuntimeError raising; all 3 call sites wrapped with context-appropriate error handling (log-only for auth endpoints, HTTP 503/502 for test-email); 7 tests covering all error paths**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-11T23:37:25Z
- **Completed:** 2026-04-11T23:40:47Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 5

## Accomplishments

- Replaced `assert settings.emails_enabled` with explicit `if not ... raise ValueError` (Pitfall 5: assert stripped in Python -O mode)
- Added SMTP status code check: `raise RuntimeError` when response not in (250, 251, 252)
- Wrapped all 3 `send_email` call sites with appropriate error handling: login.py logs only (anti-enumeration), users.py logs only (non-critical side effect), utils.py raises HTTP 503/502
- Created `tests/test_email.py` with 7 tests covering all error paths

## Task Commits

1. **Task 1 RED: Failing tests for email error surfacing** - `efa831b` (test)
2. **Task 1 GREEN: Harden send_email and wrap callers** - `e9dd154` (feat)

## Files Created/Modified

- `server/backend/tests/test_email.py` - 7 tests: send_email unit tests + /utils/test-email/ endpoint integration tests
- `server/backend/app/utils.py` - send_email() hardened: assert→if-check, status code check added
- `server/backend/app/api/routes/login.py` - send_email wrapped in try/except; errors logged silently (anti-enumeration); logging module added
- `server/backend/app/api/routes/users.py` - send_email wrapped in try/except; errors logged; user creation unblocked; logging module added
- `server/backend/app/api/routes/utils.py` - send_email wrapped in try/except; HTTP 503 (ValueError) and 502 (Exception) raised; HTTPException imported

## Decisions Made

- Password recovery (login.py) absorbs email errors — anti-enumeration security requires always returning the same 200 response regardless of email send success/failure. This is intentionally different from the test-email endpoint.
- User creation (users.py) absorbs email errors — the welcome email is a non-critical side effect. Blocking user creation because SMTP is misconfigured would be a worse UX failure than sending no email.
- Test-email endpoint (utils.py) surfaces errors as HTTP 503/502 — it is specifically designed for admins to test their SMTP configuration, so surfacing errors is the correct behavior here.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added logging import and logger to login.py and users.py**
- **Found during:** Task 1 GREEN (implementing try/except with logger.warning/logger.error)
- **Issue:** login.py and users.py did not import `logging` or instantiate `logger`, but the plan required logging email errors in both files
- **Fix:** Added `import logging` and `logger = logging.getLogger(__name__)` to both files
- **Files modified:** server/backend/app/api/routes/login.py, server/backend/app/api/routes/users.py
- **Verification:** `python -m pytest tests/ -x -q` passes (135 tests)
- **Committed in:** e9dd154 (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for correctness — logger was called but not defined. No scope creep.

## Issues Encountered

None — plan executed cleanly. The TDD cycle (RED→GREEN) worked as expected: tests failed on the assert/status-code issues, then passed after implementation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 11 is now complete: all 3 plans executed (11-01 migrations, 11-02 Tauri stubs, 11-03 email hardening)
- FIX-01, FIX-02, FIX-03 requirements all addressed
- Phase 13 (Email Auth Flows) can now build on hardened send_email — ValueError/RuntimeError semantics are stable
- Full backend test suite: 135/135 passing

---
*Phase: 11-foundation-migrations-and-stub-cleanup*
*Completed: 2026-04-11*
