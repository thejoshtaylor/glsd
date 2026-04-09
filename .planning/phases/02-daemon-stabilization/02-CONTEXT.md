# Phase 2: Daemon Stabilization - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix four specific production-blocking bugs in the Go daemon (`node/daemon/`) before relay work begins. No new features. All four bugs are already identified with clear root causes in the existing code. Phase delivers a daemon that: terminates child processes cleanly on exit, replays un-acked WAL entries on reconnect, handles WAL Append/Prune safely under concurrency, and cleans up session actors when sessions end.

</domain>

<decisions>
## Implementation Decisions

### Orphan Prevention (DAEM-01)

- **D-01:** Use **both** `Pdeathsig` (Linux) **and** a SIGTERM/SIGINT signal handler — belt-and-suspenders.
  - `Pdeathsig = syscall.SIGKILL` in `ptySysProcAttr()` (already in `claude/pty_unix.go`) covers the SIGKILL case on Linux nodes.
  - A signal handler in `cmd/start.go` (or daemon Run loop) catches SIGTERM/SIGINT, calls `manager.StopAll()`, and exits. Covers graceful shutdown and macOS dev environments.
- **D-02:** On SIGTERM, **kill immediately** — no drain/timeout. Claude doesn't have a graceful mid-session shutdown mechanism, and predictable fast shutdown is preferred over partial output.

### Welcome Message Resume (DAEM-02)

- **D-03:** On reconnect, when the `welcome` message arrives with server-acked WAL sequences, the daemon **immediately replays un-acked WAL entries** to the relay. For each session in the welcome's acked map, replay all WAL entries with `seq > acked_seq`. Server handles deduplication.
- **D-04:** After replaying, **prune the WAL immediately** for sequences the server confirmed in the welcome (same as a batch Ack). Prevents WAL growth on every reconnect cycle.
- **D-05:** Do not re-spawn session actors on reconnect. Replay is WAL→relay only. Server re-sends Task messages if a session needs to continue on the node.

### Session Actor Cleanup (DAEM-04)

- **D-06:** Session actors are removed from the manager on **two** conditions:
  1. **Natural completion** — when the actor's Run goroutine exits cleanly (claude exits 0 after TaskComplete), call `actor.Stop()` and delete from `manager.actors`.
  2. **Daemon shutdown** — existing `StopAll()` path.
- **D-07:** When Run exits with an **error**, also remove the actor from the manager map (in addition to the existing TaskError relay send). This prevents a broken actor from occupying the session slot and blocking server retries.

### WAL Concurrency Fix (DAEM-03)

- **D-08:** Replace `sync.Mutex` in `wal.Log` with `sync.RWMutex`. `ReadFrom` takes a read lock; `Append` and `PruneUpTo` take write locks. `PruneUpTo` holds the write lock for the full read→rewrite→rename operation, closing the race window.
- **D-09:** Add a **concurrent stress test** for the race condition: spin N append goroutines and M prune goroutines simultaneously, run with `-race` flag. Must pass cleanly before the fix is considered done.

### Claude's Discretion

- Signal handler wiring location (whether it lives in `cmd/start.go` or is extracted to a `shutdown` package)
- Exact goroutine join/wait mechanism for the session actor cleanup path
- Whether to add a `Remove(sessionID string)` method to Manager or inline the delete in the Spawn goroutine

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Protocol
- `node/protocol-go/PROTOCOL.md` — Wire format spec; welcome message structure and acked_sequences field
- `node/protocol-go/messages.go` — Go types for Welcome, Ack, Task, Stop messages

### Daemon Core
- `node/daemon/internal/claude/executor.go` — Executor and ptySysProcAttr; where Pdeathsig goes
- `node/daemon/internal/claude/pty_unix.go` — ptySysProcAttr implementation
- `node/daemon/internal/session/actor.go` — Actor lifecycle, Run, Stop, handleEvent
- `node/daemon/internal/session/manager.go` — Manager Spawn/StopAll; where cleanup logic goes
- `node/daemon/internal/loop/daemon.go` — runOnce; where welcome handling goes (line ~90 TODO)
- `node/daemon/internal/wal/wal.go` — WAL implementation; where RWMutex fix goes

### Tests
- `node/daemon/internal/wal/wal_test.go` — Existing WAL tests; add stress test here
- `node/daemon/internal/session/actor_test.go` — Existing actor tests

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `wal.ScanDirectory` already collects per-session WAL high-watermarks — used by `runOnce` to build the connect payload. The welcome replay logic reads from this same WAL directory.
- `actor.PruneWAL(upTo int64)` already exists and delegates to `log.PruneUpTo` — welcome-time pruning can call this same method.
- `manager.StopAll()` already exists — signal handler just needs to call it.

### Established Patterns
- `ptySysProcAttr()` in `pty_unix.go` is already the hook for process attributes — `Pdeathsig` goes here.
- `handleAck` in `loop/daemon.go` already calls `actor.PruneWAL` — welcome-time pruning follows the same pattern.
- The Spawn goroutine in `manager.go` already sends `TaskError` on Run failure — actor removal extends this goroutine.

### Integration Points
- `cmd/start.go` or `cmd/root.go` — signal handler wiring (SIGTERM/SIGINT → StopAll → exit)
- `loop/daemon.go` `runOnce()` — where `_ = welcome` becomes actual replay + prune logic
- `session/manager.go` `Spawn()` goroutine — where actor removal on exit/error happens
- `wal/wal.go` — mutex type change and PruneUpTo lock scope

</code_context>

<specifics>
## Specific Ideas

No specific references or external examples — the bugs and fixes are fully identified from the existing codebase.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-daemon-stabilization*
*Context gathered: 2026-04-09*
