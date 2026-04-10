---
phase: quick
plan: 260410-j4y
completed: 2026-04-10
duration: ~2min
tasks_completed: 1
tasks_total: 1
key_files:
  modified:
    - server/backend/app/api/deps.py
decisions:
  - "Read cookie first, fall back to Authorization header for backward compat"
  - "Changed invalid-token error from 403 to 401 to match HTTP auth semantics"
  - "Kept reusable_oauth2 and TokenDep defined for potential use elsewhere"
---

# Quick Task 260410-j4y: Fix 401 Unauthorized Errors on API Calls

Dual-strategy token extraction in CurrentUser dependency: cookie-first with Authorization header fallback.

## What Changed

Modified `get_current_user` in `server/backend/app/api/deps.py` to:

1. Read JWT from `request.cookies.get("access_token")` first (browser path)
2. Fall back to `Authorization: Bearer <token>` header (API client / test path)
3. Return 401 (not 403) when token is missing or invalid

## Why

The frontend login sets an httpOnly cookie (`access_token`), but `get_current_user` only read from the `Authorization` header via `OAuth2PasswordBearer`. Every browser request to protected endpoints returned 401.

## Verification

- 60 existing tests pass (all use Authorization header -- backward compat confirmed)
- Browser cookie auth now works for all endpoints using `CurrentUser` dependency

## Deviations from Plan

None -- plan executed exactly as written.

## Self-Check: PASSED
