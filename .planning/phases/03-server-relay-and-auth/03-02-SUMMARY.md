---
phase: 03-server-relay-and-auth
plan: 02
subsystem: api
tags: [fastapi, rest, node-pairing, argon2, websocket, crud]

requires:
  - phase: 03-server-relay-and-auth/01
    provides: "Node/Session/SessionEvent SQLModel models, ConnectionManager singleton"
provides:
  - "Node pairing REST endpoints: POST create, GET list, POST revoke"
  - "CRUD helpers: create_node_token, verify_node_token, get_nodes_by_user, revoke_node"
  - "D-03 revocation cascade: DB mark + WebSocket disconnect + taskError to browsers"
affects: [03-server-relay-and-auth/03, 03-server-relay-and-auth/04, 04-frontend]

tech-stack:
  added: []
  patterns:
    - "Node token hashing with argon2 via pwdlib (same as user passwords)"
    - "Token-once pattern: raw token returned only at creation, never stored"
    - "Constant-time token verification iterating all non-revoked nodes"

key-files:
  created:
    - server/backend/app/api/routes/nodes.py
  modified:
    - server/backend/app/crud.py
    - server/backend/app/api/main.py
    - server/backend/tests/api/routes/test_nodes.py

key-decisions:
  - "relay_url derived from FRONTEND_HOST setting rather than adding a new SERVER_HOST setting"
  - "verify_node_token iterates all non-revoked nodes for constant-time comparison to prevent timing attacks (T-03-05)"
  - "Revoke returns 404 (not 403) for non-owned nodes to prevent node enumeration (T-03-06)"

patterns-established:
  - "Token-once pattern: raw secrets returned exactly once at creation, hashed for storage"
  - "Ownership-scoped REST: all node operations filter by current_user.id"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04, RELY-01]

duration: 3min
completed: 2026-04-10
---

# Phase 03 Plan 02: Node Pairing REST API Summary

**Node pairing REST API with argon2-hashed tokens, user-scoped CRUD, and D-03 immediate revocation cascade (WebSocket disconnect + taskError broadcast)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-10T00:20:46Z
- **Completed:** 2026-04-10T00:23:55Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 4

## Accomplishments

- Node pairing REST endpoints: create token (POST), list nodes (GET), revoke node (POST)
- CRUD helpers with argon2-hashed token storage and constant-time verification
- D-03 revocation cascade: marks DB, disconnects node WebSocket (code 1008), sends taskError to all affected browser sessions
- Token returned exactly once at creation (D-02), never exposed via list endpoint
- Cross-user revocation blocked with 404 to prevent node enumeration (T-03-06)

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests for node pairing** - `390a99b` (test)
2. **Task 1 (GREEN): Node pairing implementation** - `5256d5f` (feat)

## Files Created/Modified

- `server/backend/app/api/routes/nodes.py` - Node pairing REST endpoints (create, list, revoke)
- `server/backend/app/crud.py` - Added create_node_token, verify_node_token, get_nodes_by_user, revoke_node
- `server/backend/app/api/main.py` - Mounted nodes router
- `server/backend/tests/api/routes/test_nodes.py` - 6 tests covering all pairing flows

## Decisions Made

- Used FRONTEND_HOST setting to derive relay_url rather than adding a new SERVER_HOST config field -- keeps settings minimal
- verify_node_token iterates all non-revoked nodes with constant-time argon2 comparison to prevent timing-based node enumeration (T-03-05)
- Revoke endpoint returns 404 (not 403) for non-owned nodes to prevent node enumeration (T-03-06)
- AUTH-01 (signup), AUTH-02 (login/JWT), AUTH-03 (client token discard) confirmed already implemented by existing template code

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Node pairing tokens can now be created via REST API, enabling Plan 03 (node WebSocket endpoint) to authenticate incoming daemon connections via verify_node_token
- ConnectionManager D-03 revocation cascade is wired and ready for live WebSocket connections

## Self-Check: PASSED

All files exist, all commits verified.

---
*Phase: 03-server-relay-and-auth*
*Completed: 2026-04-10*
