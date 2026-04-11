---
phase: 11-foundation-migrations-and-stub-cleanup
plan: 01
subsystem: database
tags: [alembic, sqlmodel, postgresql, migrations, push-subscription, usage-record, email-verification]

# Dependency graph
requires:
  - phase: 10-phase-verification-closure
    provides: v1.0 complete schema (node, session, session_event, project tables)
provides:
  - Alembic migration b1c2d3e4f5a6 adding all Phase 11 schema changes
  - PushSubscription SQLModel (push_subscription table) for Phase 14
  - UsageRecord SQLModel (usage_record table) for Phase 12
  - User.email_verified, email_verification_token, email_verification_sent_at for Phase 13
affects:
  - phase 12 (usage tracking -- usage_record table ready)
  - phase 13 (email auth -- User email columns ready)
  - phase 14 (web push -- push_subscription table ready)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Alembic inspector-based IF NOT EXISTS pattern for safe idempotent migrations"
    - "server_default=sa.text('true') for boolean columns where existing rows must default to True"

key-files:
  created:
    - server/backend/app/alembic/versions/b1c2d3e4f5a6_phase11_foundation_migrations.py
    - server/backend/tests/test_migrations.py
  modified:
    - server/backend/app/models.py

key-decisions:
  - "Migration appended after HEAD (a5b6c7d8e9f0), not editing the stub f9f573bd285c (D-03)"
  - "email_verified server_default=true so existing v1.0 users are unaffected (AUTH-08, Pitfall 2)"
  - "UsageRecord.cost_usd uses float in Python model vs Numeric(10,6) in SQL for precision"

patterns-established:
  - "Phase 11 migration pattern: use inspector.get_table_names() + inspector.get_columns() before every ADD COLUMN and CREATE TABLE"
  - "New future-phase tables/columns added in Phase 11 with safe defaults to avoid blocking later phases"

requirements-completed: [FIX-01]

# Metrics
duration: 4min
completed: 2026-04-11
---

# Phase 11 Plan 01: Foundation Migrations Summary

**Consolidated Alembic migration b1c2d3e4f5a6 adds push_subscription and usage_record tables plus User email verification columns with inspector-based idempotency guards and safe defaults for existing v1.0 rows**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-11T23:18:21Z
- **Completed:** 2026-04-11T23:22:29Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 3

## Accomplishments

- Created migration `b1c2d3e4f5a6` chaining from `a5b6c7d8e9f0` (current HEAD) with all Phase 11 schema changes
- Added `PushSubscription` and `UsageRecord` SQLModel models with matching migration columns
- Added `email_verified` (server_default=true), `email_verification_token`, `email_verification_sent_at` to User model
- All 128 backend tests pass (9 new migration tests added)

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing migration tests** - `51b0149` (test)
2. **Task 1 GREEN: Migration + models implementation** - `fb0c83d` (feat)

**Plan metadata:** committed with docs commit below

## Files Created/Modified

- `server/backend/app/models.py` - Added PushSubscription, UsageRecord classes; added email_verified/email_verification_token/email_verification_sent_at fields to User
- `server/backend/app/alembic/versions/b1c2d3e4f5a6_phase11_foundation_migrations.py` - New migration: creates push_subscription table, usage_record table, adds 3 User columns; uses inspector-based existence checks throughout
- `server/backend/tests/test_migrations.py` - 9 migration verification tests covering all new columns/tables, email_verified=True default for existing users, idempotency

## Decisions Made

- Migration `b1c2d3e4f5a6` is a NEW file appended after HEAD (`a5b6c7d8e9f0`) per D-03 — the stub `f9f573bd285c` is untouched
- `email_verified` uses `server_default=sa.text("true")` so existing v1.0 database rows are treated as verified, preventing lockout (AUTH-08)
- `UsageRecord.cost_usd` is `float` in the Python model but `Numeric(10,6)` in the SQL migration for precision storage

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Stale alembic_version in shared dev database**
- **Found during:** Task 1 (running `alembic upgrade head`)
- **Issue:** The local `app` PostgreSQL database had `alembic_version = 'z2j_chat_ux_polish'` from a different co-located project, causing Alembic to refuse all operations
- **Fix:** Identified the actual DB schema state (node/session/session_event tables present, project table missing), determined the correct GSD revision (`b3c4d5e6f7a8`), directly updated `alembic_version` via SQL, then ran `alembic upgrade head` which applied 6 migrations cleanly
- **Files modified:** None (database-only fix)
- **Verification:** `alembic upgrade head` completed successfully, all 6 pending migrations applied
- **Committed in:** Not committed (database-only operation)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Blocking issue was a dev environment artifact — the fix was safe (matching stamped revision to actual schema state). No scope creep.

## Issues Encountered

- Shared dev PostgreSQL `app` database had an unrecognized alembic_version from another project. Fixed by stamping to the correct GSD revision before running migrations. This will not affect Docker Compose deployments where the DB is isolated.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 11 Plan 02 (Tauri stub replacement) can proceed immediately
- Phase 12 (Usage Tracking) unblocked: `usage_record` table exists
- Phase 13 (Email Auth) unblocked: User email columns exist with correct defaults
- Phase 14 (Web Push) unblocked: `push_subscription` table exists
- No blockers

## Self-Check: PASSED

- FOUND: server/backend/app/models.py (contains PushSubscription, UsageRecord, email_verified)
- FOUND: server/backend/app/alembic/versions/b1c2d3e4f5a6_phase11_foundation_migrations.py
- FOUND: server/backend/tests/test_migrations.py
- FOUND: .planning/phases/11-foundation-migrations-and-stub-cleanup/11-01-SUMMARY.md
- Commit 51b0149 (test): failing migration tests
- Commit fb0c83d (feat): migration + models implementation
- Commit ed5d619 (docs): plan metadata

---
*Phase: 11-foundation-migrations-and-stub-cleanup*
*Completed: 2026-04-11*
