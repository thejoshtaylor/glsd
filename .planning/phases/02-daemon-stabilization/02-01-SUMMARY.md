---
phase: 02-daemon-stabilization
plan: 01
subsystem: daemon
tags: [go, wal, concurrency, rwmutex, session-management, goroutine-cleanup]

# Dependency graph
requires:
  - phase: 01-monorepo-scaffold
    provides: Go workspace with daemon and protocol-go modules building cleanly
provides:
  - Race-free WAL with RWMutex protecting PruneUpTo read-rewrite-rename atomically
  - Session actor cleanup on Manager.Spawn goroutine exit (both success and error paths)
affects: [02-02 welcome-replay, 03-relay-hub]

# Tech tracking
tech-stack:
  added: []
  patterns: [RWMutex for read-heavy WAL access, inline read logic in PruneUpTo to avoid deadlock on non-reentrant RWMutex, goroutine cleanup with delete-then-stop ordering]

key-files:
  created: []
  modified:
    - node/daemon/internal/wal/wal.go
    - node/daemon/internal/wal/wal_test.go
    - node/daemon/internal/session/manager.go
    - node/daemon/internal/session/manager_test.go

key-decisions:
  - "PruneUpTo inlines read logic rather than calling ReadFrom to avoid deadlock on non-reentrant RWMutex"
  - "Actor cleanup uses delete-before-Stop ordering so StopAll does not double-stop a dying actor"
  - "TestActorCleanupOnExit calls actor.Stop() to close stdin then verifies manager removes actor after Run returns"

patterns-established:
  - "WAL locking: RLock for reads, Lock for writes and prune; PruneUpTo holds write lock for entire operation"
  - "Goroutine cleanup: Spawn goroutine always deletes actor from map after Run returns, regardless of exit reason"

requirements-completed: [DAEM-03, DAEM-04]

# Metrics
duration: 5min
completed: 2026-04-09
---

# Phase 02 Plan 01: WAL Race Fix and Actor Cleanup Summary

**Race-free WAL via RWMutex with PruneUpTo holding write lock for entire read-rewrite-rename, plus automatic session actor removal from Manager map on Run exit**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-09T22:53:38Z
- **Completed:** 2026-04-09T22:58:39Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- WAL PruneUpTo no longer has a race window where appended entries can be silently lost between read and rewrite
- ReadFrom uses RLock allowing concurrent reads while PruneUpTo and Append use exclusive write locks
- Session actors are removed from Manager.actors map when their Run goroutine exits, preventing resource leaks and slot exhaustion
- All changes verified with -race flag; TestConcurrentAppendAndPrune stress test (10 writers + 3 pruners) passes cleanly

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix WAL RWMutex race condition (DAEM-03)** - TDD
   - `a5d6ba2` test(02-01): add failing concurrent WAL stress test
   - `625d8f9` feat(02-01): fix WAL concurrency race with RWMutex
2. **Task 2: Add session actor cleanup on Run exit (DAEM-04)** - TDD
   - `2b13421` test(02-01): add failing actor cleanup tests
   - `5a08e7b` feat(02-01): add session actor cleanup on Run exit

## Files Created/Modified
- `node/daemon/internal/wal/wal.go` - Changed Mutex to RWMutex, ReadFrom uses RLock, PruneUpTo inlines read logic under write lock
- `node/daemon/internal/wal/wal_test.go` - Added TestConcurrentAppendAndPrune stress test
- `node/daemon/internal/session/manager.go` - Spawn goroutine deletes actor from map and calls Stop after Run returns
- `node/daemon/internal/session/manager_test.go` - Added TestActorCleanupOnExit and TestActorCleanupOnError

## Decisions Made
- PruneUpTo inlines the read-scan logic instead of calling ReadFrom because Go's RWMutex is not reentrant -- calling ReadFrom (which takes RLock) from within PruneUpTo (which holds Lock) would deadlock
- Actor cleanup uses delete-then-Stop ordering: delete from map first so StopAll (which iterates map) does not double-stop a dying actor; Stop uses sync.Once for stopCh but executor.Close and log.Close may error on double-close
- TestActorCleanupOnExit explicitly calls actor.Stop() after TaskComplete to close stdin and cause fake-claude to exit, since the subprocess blocks on scanner.Scan until stdin closes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TestActorCleanupOnExit timing adjustment**
- **Found during:** Task 2 (GREEN phase)
- **Issue:** Plan's test pattern waited for TaskComplete then polled for cleanup, but actor.Run does not return until the subprocess exits. fake-claude blocks on stdin after processing a task, so Run never returns without explicit Stop.
- **Fix:** Added explicit `a.Stop()` call after waitForTaskComplete to close stdin and trigger clean process exit, then poll for map cleanup. This matches production behavior where context cancellation or explicit stop triggers process exit.
- **Files modified:** node/daemon/internal/session/manager_test.go
- **Verification:** TestActorCleanupOnExit passes in ~0.5s with -race
- **Committed in:** 5a08e7b (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug in test design)
**Impact on plan:** Test still validates the same invariant (actor removed from map after Run exits). No scope creep.

## Issues Encountered
None beyond the test timing issue documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- WAL is now race-free and ready for welcome replay (Plan 02-02)
- Session actor cleanup prevents resource leaks, supporting long-running daemon deployments
- All existing tests in both packages continue to pass

## Self-Check: PASSED

All 4 files verified present. All 4 commits verified in git log. Key patterns (sync.RWMutex, delete(m.actors, test functions) confirmed in source.

---
*Phase: 02-daemon-stabilization*
*Completed: 2026-04-09*
