---
phase: 02-daemon-stabilization
plan: 02
subsystem: daemon
tags: [go, signal-handling, pdeathsig, wal-replay, websocket, orphan-prevention]

# Dependency graph
requires:
  - phase: 02-daemon-stabilization/01
    provides: "RWMutex WAL fixes, actor cleanup ordering"
provides:
  - "Daemon.Shutdown() method for clean signal-handler teardown"
  - "Pdeathsig kernel-level orphan prevention on Linux"
  - "Welcome message WAL replay (un-acked entries sent to relay on reconnect)"
  - "WAL prune after welcome ack"
affects: [03-relay-hub, daemon-e2e]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Build-tag split for platform-specific SysProcAttr (pty_linux.go / pty_notlinux.go)"
    - "sender interface field on Daemon for relay testability"

key-files:
  created:
    - node/daemon/internal/claude/pty_linux.go
    - node/daemon/internal/claude/pty_notlinux.go
  modified:
    - node/daemon/internal/loop/daemon.go
    - node/daemon/internal/loop/daemon_test.go
    - node/daemon/internal/claude/pty_unix.go
    - node/daemon/cmd/start.go

key-decisions:
  - "Split ptySysProcAttr into build-tagged files rather than runtime GOOS check for compile-time safety"
  - "sender field (session.RelaySender interface) on Daemon for test mockability instead of refactoring relay.Client to an interface"
  - "Welcome replay is best-effort: errors logged, not fatal to connection"

patterns-established:
  - "Build-tag file split pattern: shared code in _unix.go, platform variants in _linux.go / _notlinux.go"
  - "Daemon testability via interface fields initialized in constructor"

requirements-completed: [DAEM-01, DAEM-02]

# Metrics
duration: 5min
completed: 2026-04-09
---

# Phase 02 Plan 02: Orphan Prevention and WAL Replay Summary

**Signal handler with Shutdown/StopAll, Linux Pdeathsig via build-tag split, and welcome message WAL replay with ack-driven pruning**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-09T23:00:55Z
- **Completed:** 2026-04-09T23:05:35Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Signal handler calls Daemon.Shutdown() before cancel(), immediately killing all child Claude processes on SIGTERM/SIGINT (D-02)
- Linux child processes get Pdeathsig SIGKILL for kernel-level orphan prevention even if daemon is SIGKILL'd (D-01)
- Welcome message WAL replay sends un-acked entries to relay on reconnect (D-03), prunes acked entries (D-04), and does not re-spawn actors (D-05)
- Active actor sessions route through actor.PruneWAL to avoid dual-writer WAL corruption (Pitfall 3)

## Task Commits

Each task was committed atomically:

1. **Task 1: Signal handler shutdown and Pdeathsig orphan prevention** - `454ec95` (feat)
2. **Task 2: Welcome message WAL replay and prune** - `63de024` (feat)

## Files Created/Modified
- `node/daemon/internal/claude/pty_linux.go` - Linux ptySysProcAttr with Pdeathsig SIGKILL
- `node/daemon/internal/claude/pty_notlinux.go` - macOS/FreeBSD ptySysProcAttr without Pdeathsig
- `node/daemon/internal/claude/pty_unix.go` - Removed ptySysProcAttr, retains openClaudePTY only
- `node/daemon/internal/loop/daemon.go` - Added Shutdown(), handleWelcomeReplay(), sender field, defer StopAll
- `node/daemon/internal/loop/daemon_test.go` - TestWelcomeReplay, TestWelcomeReplayNoWAL, TestWelcomeReplayNilWelcome
- `node/daemon/cmd/start.go` - Signal handler calls d.Shutdown() before cancel()

## Decisions Made
- Split ptySysProcAttr into build-tagged files (pty_linux.go / pty_notlinux.go) rather than runtime GOOS check -- compile-time safety ensures Pdeathsig is never referenced on platforms that don't have it
- Added sender field (session.RelaySender) to Daemon for test mockability -- avoids refactoring relay.Client to an interface which would be a larger change
- Welcome replay is best-effort: errors are logged but do not fail the connection, since the relay can always request a ReplayRequest if entries are missed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing flaky TestE2EPermissionFlow e2e test fails with timeout -- unrelated to this plan's changes, was failing before Task 1 as well

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 02 (daemon-stabilization) is complete: both plans shipped
- Daemon has clean shutdown, orphan prevention, and welcome replay -- ready for Phase 03 (relay hub) integration
- The pre-existing TestE2EPermissionFlow flake should be investigated separately but does not block relay work

---
*Phase: 02-daemon-stabilization*
*Completed: 2026-04-09*
