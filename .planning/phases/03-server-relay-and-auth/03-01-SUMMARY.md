---
phase: 03-server-relay-and-auth
plan: 01
subsystem: database, api, protocol
tags: [sqlmodel, pydantic, websocket, postgresql, alembic, jsonb]

# Dependency graph
requires:
  - phase: 02-daemon-stabilization
    provides: stable daemon with WAL replay and PTY management
provides:
  - Node, SessionModel, SessionEvent SQLModel table classes
  - NodePublic, NodePairResponse, SessionPublic response models
  - Pydantic protocol message models mirroring protocol-go/messages.go
  - ConnectionManager singleton for WebSocket routing
  - Alembic migration for node, session, session_event tables
  - Test infrastructure with api/, ws/ packages
affects: [03-02, 03-03, 03-04, 03-05]

# Tech tracking
tech-stack:
  added: [sqlalchemy.dialects.postgresql.JSONB]
  patterns: [camelCase Pydantic aliases for wire format, module-level singleton for ConnectionManager, discriminated union types for protocol messages]

key-files:
  created:
    - server/backend/app/relay/__init__.py
    - server/backend/app/relay/protocol.py
    - server/backend/app/relay/connection_manager.py
    - server/backend/app/alembic/versions/a1b2c3d4e5f6_add_node_session_and_session_event_tables.py
    - server/backend/tests/api/__init__.py
    - server/backend/tests/api/routes/__init__.py
    - server/backend/tests/ws/__init__.py
  modified:
    - server/backend/app/models.py
    - server/backend/tests/conftest.py
    - server/backend/tests/test_foundation.py

key-decisions:
  - "Used SessionModel (not Session) to avoid SQLModel.Session name conflict"
  - "Protocol models use populate_by_name=True for camelCase wire format with snake_case Python attrs"
  - "ConnectionManager uses asyncio.Lock for thread-safe register/unregister (T-03-03 mitigation)"
  - "Manual Alembic migration (DB not running in dev env) following existing migration patterns"

patterns-established:
  - "Pydantic protocol models: Literal type field + camelCase aliases + populate_by_name"
  - "Module-level singleton: manager = ConnectionManager() at bottom of module"
  - "Response models exclude sensitive fields (NodePublic omits token_hash per T-03-01)"

requirements-completed: [RELY-03, SESS-06]

# Metrics
duration: 7min
completed: 2026-04-10
---

# Phase 3 Plan 01: Foundation Layer Summary

**Node/Session/SessionEvent SQLModel tables, 14 Pydantic protocol models mirroring protocol-go, and ConnectionManager singleton for WebSocket routing**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-10T00:11:54Z
- **Completed:** 2026-04-10T00:18:24Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Three new database tables (Node, SessionModel, SessionEvent) with proper FK relationships and indexes
- 14 Pydantic protocol message models matching protocol-go/messages.go wire format with camelCase aliases
- ConnectionManager with register/unregister/send/disconnect plus D-03 revocation helpers
- Test infrastructure: conftest cleanup for new tables, api/ws test packages

## Task Commits

Each task was committed atomically:

1. **Task 1: Database models, Alembic migration, and protocol Pydantic models** - `38c1af8` (feat)
2. **Task 2: ConnectionManager and updated test conftest** - `3bf1790` (feat)

## Files Created/Modified
- `server/backend/app/models.py` - Added Node, SessionModel, SessionEvent table classes plus response models
- `server/backend/app/relay/__init__.py` - Empty package init
- `server/backend/app/relay/protocol.py` - 14 Pydantic models mirroring protocol-go/messages.go
- `server/backend/app/relay/connection_manager.py` - WebSocket connection registry singleton
- `server/backend/app/alembic/versions/a1b2c3d4e5f6_...py` - Migration for node, session, session_event tables
- `server/backend/tests/conftest.py` - Added cleanup for SessionEvent, SessionModel, Node tables
- `server/backend/tests/test_foundation.py` - Removed xfail markers, added noconftest note
- `server/backend/tests/api/__init__.py` - Test package init
- `server/backend/tests/api/routes/__init__.py` - Test package init
- `server/backend/tests/ws/__init__.py` - Test package init

## Decisions Made
- Used `SessionModel` instead of `Session` to avoid conflict with SQLModel's `Session` class
- Protocol models use `populate_by_name=True` for bidirectional field access (camelCase for wire, snake_case for Python)
- ConnectionManager is a module-level singleton (`manager = ConnectionManager()`) for easy FastAPI dependency injection
- Wrote Alembic migration manually since PostgreSQL DB is not running in dev environment

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed test_foundation.py to run without DB**
- **Found during:** Task 1 (TDD GREEN phase)
- **Issue:** Root conftest.py has session-scoped autouse=True DB fixture that tries to connect to PostgreSQL. Foundation tests are pure unit tests that only validate model schemas, not DB operations.
- **Fix:** Removed xfail markers (tests now pass), added docstring noting --noconftest flag for running without DB
- **Files modified:** server/backend/tests/test_foundation.py
- **Verification:** `python -m pytest tests/test_foundation.py --noconftest` -- all 5 tests pass
- **Committed in:** 38c1af8 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Auto-fix was necessary to verify test passage without running PostgreSQL. No scope creep.

## Issues Encountered
- PostgreSQL not running in dev environment, so Alembic autogenerate was not available. Migration was written manually following existing migration file patterns. Migration should be validated when DB is available.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three table models ready for downstream plans (node pairing, session management, relay)
- ConnectionManager ready for WebSocket endpoint integration
- Protocol models ready for message validation at WebSocket boundary
- Test packages ready for route and WebSocket tests

## Self-Check: PASSED

- All 8 created files verified present on disk
- Both task commits (38c1af8, 3bf1790) verified in git log

---
*Phase: 03-server-relay-and-auth*
*Completed: 2026-04-10*
