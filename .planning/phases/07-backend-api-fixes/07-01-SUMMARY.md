---
phase: 07-backend-api-fixes
plan: 01
subsystem: server-backend
tags: [api, nodes, sessions, auth, tests]
dependency_graph:
  requires: []
  provides:
    - GET /api/v1/nodes/{node_id} endpoint
    - node_id filter on GET /api/v1/sessions/
    - channel_id field on SessionPublic
    - real auth test assertions (no xfail)
  affects:
    - server/backend/app/api/routes/nodes.py
    - server/backend/app/api/routes/sessions.py
    - server/backend/app/models.py
    - server/backend/app/crud.py
    - server/backend/tests/api/routes/test_nodes.py
    - server/backend/tests/api/routes/test_sessions.py
    - server/backend/tests/api/routes/test_auth.py
tech_stack:
  added: []
  patterns:
    - UUID parse + try/except ValueError returning 404 for node path params
    - Optional Query param with default=None for node_id session filter
    - random_email() for test isolation (avoid hardcoded email collision)
    - settings.FIRST_SUPERUSER credentials for login test isolation
key_files:
  created: []
  modified:
    - server/backend/app/api/routes/nodes.py
    - server/backend/app/api/routes/sessions.py
    - server/backend/app/models.py
    - server/backend/app/crud.py
    - server/backend/tests/api/routes/test_nodes.py
    - server/backend/tests/api/routes/test_sessions.py
    - server/backend/tests/api/routes/test_auth.py
decisions:
  - GET /nodes/{node_id} placed before /{node_id}/revoke and /{node_id}/fs to avoid FastAPI route ordering conflicts
  - channel_id added to SessionPublic only (not SessionModel) because it is ephemeral runtime state, not persisted in DB
  - node_id filter returns empty list on invalid UUID (T-07-02 isolation) rather than 404
  - test_login_returns_jwt uses FIRST_SUPERUSER credentials to remove dependency on test_signup ordering
metrics:
  duration_seconds: 144
  completed_date: "2026-04-10"
  tasks_completed: 2
  files_modified: 7
---

# Phase 7 Plan 1: Backend API Completion Summary

**One-liner:** Five backend API gaps closed — GET /nodes/{id} with ownership check, node_id session filter, channel_id on SessionPublic, and xfail auth stubs converted to real passing tests.

## What Was Built

### Task 07-01-01: GET /nodes/{node_id}, node_id session filter, channel_id on SessionPublic

**Commits:** `3c370e3`

Four production changes and two test additions:

1. **`server/backend/app/api/routes/nodes.py`** — Added `get_node` route handler at `GET /{node_id}`. Placed before `/{node_id}/revoke` to avoid FastAPI route conflict. Uses `crud.get_node_by_id(user_id=current_user.id)` for ownership check; returns 404 for both not-found and not-owned (T-07-01: no info leak).

2. **`server/backend/app/api/routes/sessions.py`** — Added `from fastapi import Query` import. Added `node_id: str | None = Query(default=None)` to `list_sessions` signature. Passes `node_id=node_id` through to `crud.get_sessions_by_user`.

3. **`server/backend/app/models.py`** — Added `channel_id: str | None = None` to `SessionPublic` after `cwd: str`. Not added to `SessionModel` — channel_id is ephemeral WebSocket routing state, not persisted.

4. **`server/backend/app/crud.py`** — Added `node_id: str | None = None` parameter to `get_sessions_by_user`. When provided, parses as UUID (returns `[]` on `ValueError`) and applies `.where(SessionModel.node_id == nid)` while always keeping `WHERE user_id = current_user.id` (T-07-02 isolation).

5. **`server/backend/tests/api/routes/test_nodes.py`** — Added `test_get_node`, `test_get_node_not_found`, `test_get_other_users_node`.

6. **`server/backend/tests/api/routes/test_sessions.py`** — Added `test_list_sessions_by_node` (two-node isolation check), `test_create_session_has_channel_id` (asserts key present, value None).

### Task 07-01-02: Convert xfail stubs to real passing tests

**Commits:** `abcd5dd`

1. **`server/backend/tests/api/routes/test_auth.py`** — Removed all three `@pytest.mark.xfail` decorators. Added imports for `settings` and `random_email`. Fixed `test_signup_creates_user` to use `random_email()` instead of hardcoded `wave0test@example.com`. Fixed `test_login_returns_jwt` to use `settings.FIRST_SUPERUSER` / `settings.FIRST_SUPERUSER_PASSWORD` (eliminates ordering dependency on test_signup). Left `test_logout_is_client_side` body unchanged.

## Verification

```
22 passed, 0 failures, 0 errors
```

Full targeted suite: `python -m pytest tests/api/routes/test_auth.py tests/api/routes/test_nodes.py tests/api/routes/test_sessions.py -x -q`

## Acceptance Criteria

- [x] `grep "def get_node" server/backend/app/api/routes/nodes.py` — match found
- [x] `grep "node_id: str | None = Query" server/backend/app/api/routes/sessions.py` — match found
- [x] `grep "channel_id: str | None = None" server/backend/app/models.py` — match found
- [x] `grep -c "xfail" server/backend/tests/api/routes/test_auth.py` — returns 0
- [x] Full test suite exits 0 (22 passed)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. `channel_id` is `None` in REST-created sessions by design (the field is populated at WebSocket connection time by the relay, not at session creation). The frontend already handles the `None` case via fallback to `sessionId`.

## Threat Flags

No new network endpoints or auth paths beyond what the threat model covers. All T-07-0x mitigations implemented as specified.

## Self-Check: PASSED

- `server/backend/app/api/routes/nodes.py` — FOUND: `def get_node`
- `server/backend/app/api/routes/sessions.py` — FOUND: `node_id: str | None = Query`
- `server/backend/app/models.py` — FOUND: `channel_id: str | None = None`
- `server/backend/app/crud.py` — FOUND: `node_id: str | None = None`
- `server/backend/tests/api/routes/test_auth.py` — FOUND: 0 xfail occurrences
- Commit `3c370e3` — FOUND
- Commit `abcd5dd` — FOUND
