# Phase 2: Daemon Stabilization - Research

**Researched:** 2026-04-09
**Domain:** Go daemon process management, WAL concurrency, signal handling
**Confidence:** HIGH

## Summary

Phase 2 fixes four identified bugs in the Go daemon (`node/daemon/`). All bugs have clear root causes in existing code and well-defined fixes specified in CONTEXT.md decisions. No new features, no new dependencies, no external services. The work is entirely within the `node/daemon/` Go module.

The daemon is a Go 1.25 binary using `coder/websocket`, `creack/pty`, and `spf13/cobra`. The four fixes target: (1) orphan process prevention via signal handler + Pdeathsig, (2) WAL replay on welcome message receipt, (3) WAL RWMutex race fix, and (4) session actor cleanup on exit. All fixes touch existing files with established patterns.

**Primary recommendation:** Implement the four fixes in dependency order -- WAL concurrency fix first (DAEM-03, foundational), then welcome replay (DAEM-02, depends on correct WAL), then orphan prevention (DAEM-01) and actor cleanup (DAEM-04) in parallel.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Use both `Pdeathsig` (Linux) and a SIGTERM/SIGINT signal handler -- belt-and-suspenders. `Pdeathsig = syscall.SIGKILL` in `ptySysProcAttr()` (already in `claude/pty_unix.go`). Signal handler in `cmd/start.go` catches SIGTERM/SIGINT, calls `manager.StopAll()`, and exits.
- **D-02:** On SIGTERM, kill immediately -- no drain/timeout.
- **D-03:** On reconnect, when the `welcome` message arrives with server-acked WAL sequences, immediately replay un-acked WAL entries to the relay. For each session, replay all WAL entries with `seq > acked_seq`.
- **D-04:** After replaying, prune the WAL immediately for sequences the server confirmed in the welcome.
- **D-05:** Do not re-spawn session actors on reconnect. Replay is WAL-to-relay only.
- **D-06:** Session actors are removed from the manager on natural completion (Run exits cleanly) and daemon shutdown (StopAll).
- **D-07:** When Run exits with an error, also remove the actor from the manager map.
- **D-08:** Replace `sync.Mutex` in `wal.Log` with `sync.RWMutex`. `ReadFrom` takes a read lock; `Append` and `PruneUpTo` take write locks. `PruneUpTo` holds the write lock for the full read-rewrite-rename operation.
- **D-09:** Add a concurrent stress test for the WAL race condition with `-race` flag.

### Claude's Discretion
- Signal handler wiring location (whether it lives in `cmd/start.go` or is extracted to a `shutdown` package)
- Exact goroutine join/wait mechanism for the session actor cleanup path
- Whether to add a `Remove(sessionID string)` method to Manager or inline the delete in the Spawn goroutine

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DAEM-01 | Daemon terminates all Claude child processes when the daemon exits (no orphaned processes) | Signal handler wiring in `cmd/start.go` + `Pdeathsig` in `pty_unix.go`. See Architecture Patterns section. |
| DAEM-02 | Daemon correctly processes the `welcome` message and resumes from acked WAL sequence after reconnect | Welcome handling in `loop/daemon.go` `runOnce()`. See welcome replay pattern in Code Examples. |
| DAEM-03 | WAL append and prune operations are race-condition free | RWMutex fix in `wal/wal.go` + PruneUpTo lock scope change. See WAL concurrency pattern. |
| DAEM-04 | Session actor resources are cleaned up when a session ends | Actor removal in `session/manager.go` Spawn goroutine. See actor cleanup pattern. |
</phase_requirements>

## Standard Stack

No new dependencies. All work uses existing packages already in `node/daemon/go.mod`.

### Core (already in go.mod)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Go stdlib `sync` | Go 1.25 | `sync.RWMutex` for WAL fix | Built-in, zero overhead [VERIFIED: go.mod go 1.25.0] |
| Go stdlib `os/signal` | Go 1.25 | Signal handler for SIGTERM/SIGINT | Already used in `cmd/start.go` [VERIFIED: source code] |
| Go stdlib `syscall` | Go 1.25 | `Pdeathsig` for orphan prevention | Already imported in `pty_unix.go` [VERIFIED: source code] |

### Alternatives Considered
None -- no new libraries needed. All fixes use Go stdlib features.

## Architecture Patterns

### Recommended Change Structure
```
node/daemon/
  internal/
    wal/wal.go           # DAEM-03: sync.Mutex -> sync.RWMutex, PruneUpTo lock scope
    wal/wal_test.go      # DAEM-03: concurrent stress test
    loop/daemon.go       # DAEM-02: welcome replay + prune in runOnce()
    session/manager.go   # DAEM-04: actor removal on Run exit
    claude/pty_unix.go   # DAEM-01: add Pdeathsig to SysProcAttr
  cmd/start.go           # DAEM-01: ensure StopAll on signal (already wired but needs manager access)
```

### Pattern 1: WAL RWMutex Fix (DAEM-03)

**What:** The current `PruneUpTo` calls `ReadFrom` (which takes `mu.Lock()`), then takes `mu.Lock()` again. This creates a window between the read and the rewrite where concurrent `Append` calls can write entries that get lost during the rename. The fix: change to `sync.RWMutex`, make `PruneUpTo` hold the write lock for the entire operation (inline the read instead of calling `ReadFrom`), and make `ReadFrom` take a read lock.

**Current bug (line 112-119 of wal.go):**
```go
// PruneUpTo calls ReadFrom (takes lock, releases it), then takes lock again.
// Between those two locks, Append can write entries that get lost.
func (l *Log) PruneUpTo(upTo int64) error {
    remaining, err := l.ReadFrom(upTo)  // Lock + Unlock
    // *** RACE WINDOW: Append can write here ***
    l.mu.Lock()  // Lock again
    defer l.mu.Unlock()
    // ... rewrite + rename (entries appended during gap are lost)
```

**Fix pattern:**
```go
// PruneUpTo holds write lock for the entire read-rewrite-rename operation.
func (l *Log) PruneUpTo(upTo int64) error {
    l.mu.Lock()  // Write lock from the start
    defer l.mu.Unlock()

    // Inline the read (don't call ReadFrom which would deadlock)
    if err := l.w.Flush(); err != nil {
        return err
    }
    f, err := os.Open(l.path)
    // ... scan, filter, rewrite, rename ...
}
```
[VERIFIED: wal.go source code shows the exact race pattern]

### Pattern 2: Welcome Replay (DAEM-02)

**What:** On reconnect, `runOnce()` receives a `Welcome` message containing `AckedSequencesBySession` -- a map of sessionID to the last sequence the server has persisted. The daemon must replay any WAL entries with `seq > acked_seq` and then prune acked entries.

**Current code (loop/daemon.go line 131):**
```go
_ = welcome // TODO: use acked sequences to drive WAL replay
```

**Fix pattern:** After receiving welcome, iterate over each session's WAL, read entries beyond the server's acked sequence, send them via `d.client.Send`, then prune. This uses the same `wal.Open`/`ReadFrom`/`Close` pattern already used in `handleReplay`.
[VERIFIED: loop/daemon.go source code, protocol.Welcome struct has AckedSequencesBySession field]

### Pattern 3: Signal Handler + Pdeathsig (DAEM-01)

**What:** Two complementary mechanisms prevent orphaned Claude processes.

**Pdeathsig (Linux-only):** Set `Pdeathsig: syscall.SIGKILL` in `ptySysProcAttr()`. When the daemon parent process dies (even SIGKILL), the kernel sends SIGKILL to the child. This already has a natural home in `pty_unix.go` `ptySysProcAttr()`. Note: `Pdeathsig` is a Linux-only `SysProcAttr` field; on macOS it is absent from the struct. The code needs a build-tag split or conditional compilation.

**Signal handler (cross-platform):** `cmd/start.go` already has a signal handler that cancels the context. The issue is that context cancellation propagates through `d.Run(ctx)` -> `d.client.Run(ctx)` but does not explicitly call `manager.StopAll()`. Per D-02, on signal the daemon should call `StopAll()` (which calls `actor.Stop()` -> `executor.Close()` -> stdin close -> Claude exits) and then exit. The daemon struct needs to expose StopAll or provide a Shutdown method.
[VERIFIED: cmd/start.go source code, pty_unix.go source code]

### Pattern 4: Actor Cleanup (DAEM-04)

**What:** The Spawn goroutine in `manager.go` runs `actor.Run(ctx)` but never removes the actor from `m.actors` when Run returns. A completed or errored actor remains in the map, blocking the session slot.

**Current code (manager.go lines 88-111):** The goroutine sends `TaskError` on error but never deletes from `m.actors`.

**Fix pattern:** After `actor.Run(ctx)` returns (both success and error paths), acquire `m.mu`, delete the actor from `m.actors`, and call `actor.Stop()` to release WAL resources.
[VERIFIED: manager.go source code]

### Anti-Patterns to Avoid
- **Double-locking in PruneUpTo:** Never call a lock-taking method from within a locked scope on the same mutex. Inline the logic instead.
- **Pdeathsig on macOS:** `Pdeathsig` does not exist in `syscall.SysProcAttr` on Darwin. Must use build tags (`//go:build linux`) or conditional compilation.
- **Goroutine leak in actor cleanup:** Do not call `actor.Stop()` from inside the Spawn goroutine if Stop closes `stopCh` (which the Run goroutine selects on) -- Run already returned at that point so it is safe, but verify the ordering.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| RWMutex | Custom lock-free WAL | `sync.RWMutex` | Battle-tested, race detector understands it |
| Process reaping on parent death | Manual PID polling/watchdog | `Pdeathsig` (Linux) + signal handler | Kernel-level guarantee; polling has race windows |
| Reconnection with replay | Custom WAL replay protocol | Existing `wal.ReadFrom` + `client.Send` | Already built; just wire them together in `runOnce` |

## Common Pitfalls

### Pitfall 1: Pdeathsig Not Available on macOS
**What goes wrong:** Setting `Pdeathsig` in `SysProcAttr` on macOS causes a compile error because the field does not exist on Darwin.
**Why it happens:** `Pdeathsig` is a Linux-specific kernel feature (`prctl(PR_SET_PDEATHSIG)`).
**How to avoid:** Use `//go:build linux` on a file that sets `Pdeathsig`, and a separate `//go:build !linux` file that returns the current `SysProcAttr` without it. The current `pty_unix.go` has `//go:build !windows` which covers both Linux and macOS -- this needs to be split.
**Warning signs:** Build failure on macOS dev machines.
[VERIFIED: Go documentation on SysProcAttr -- Pdeathsig is linux-only]

### Pitfall 2: PruneUpTo Deadlock After RWMutex Change
**What goes wrong:** If `PruneUpTo` calls `ReadFrom` after switching to `RWMutex`, it deadlocks because `PruneUpTo` holds the write lock and `ReadFrom` tries to take the read lock (non-reentrant).
**Why it happens:** Go's `sync.RWMutex` is not reentrant.
**How to avoid:** Inline the read logic directly in `PruneUpTo` instead of calling `ReadFrom`.
**Warning signs:** Tests hang forever.
[VERIFIED: Go sync.RWMutex documentation -- not reentrant]

### Pitfall 3: Welcome Replay Opening WAL Files That Actors Also Hold Open
**What goes wrong:** The welcome replay in `runOnce` opens WAL files via `wal.Open` for sessions that may or may not have active actors. If an actor is already running, two `wal.Log` instances could operate on the same file.
**Why it happens:** WAL files are identified by path, and `wal.Open` does not enforce single-writer.
**How to avoid:** For sessions with active actors, use the actor's existing `PruneWAL` method (which delegates to the already-open `wal.Log`). For sessions without actors (WAL files from previous daemon runs), it is safe to open a new `wal.Log` for replay. The welcome's `AckedSequencesBySession` may include sessions that have no active actor but do have WAL files on disk -- handle both cases.
**Warning signs:** Corrupted WAL files, duplicate entries.

### Pitfall 4: Signal Handler Race with Manager Initialization
**What goes wrong:** If a signal arrives between daemon construction and `Run()`, the context is canceled but `StopAll` may not be called (the daemon has no actors yet, so this is benign, but the shutdown path should still be clean).
**Why it happens:** The signal handler in `cmd/start.go` only cancels the context; it does not call `StopAll`.
**How to avoid:** Either (a) expose `Daemon.Shutdown()` that calls `manager.StopAll()` and call it from the signal handler, or (b) have `Daemon.Run` defer `manager.StopAll()` so context cancellation triggers cleanup on the way out.
**Warning signs:** Orphaned processes after SIGTERM during startup.

### Pitfall 5: Actor.Stop() Called Twice
**What goes wrong:** The cleanup goroutine in Spawn calls `actor.Stop()` after Run exits, and `StopAll()` also calls `actor.Stop()` on shutdown.
**Why it happens:** Two cleanup paths converge on the same actor.
**How to avoid:** `Stop()` already uses `sync.Once` for `stopCh`, but `executor.Close()` and `log.Close()` are not once-guarded. Verify that double-Close on the WAL and executor is safe (WAL Close flushes then closes the file -- double close returns an error but does not panic). The Spawn goroutine should delete from `m.actors` before `StopAll` runs, so `StopAll` would not see the actor. But during concurrent shutdown, both paths may race.
**Warning signs:** "close of closed channel" panic, or error logs from double-close.
[VERIFIED: actor.go Stop() uses sync.Once for stopCh, but executor.Close() and log.Close() are not once-guarded]

## Code Examples

### WAL RWMutex Fix (DAEM-03)
```go
// Source: Derived from current wal.go with decisions D-08, D-09
// In wal.go: change type and fix PruneUpTo

type Log struct {
    mu   sync.RWMutex  // Changed from sync.Mutex
    path string
    f    *os.File
    w    *bufio.Writer
}

// ReadFrom takes a read lock (allows concurrent reads)
func (l *Log) ReadFrom(fromSeq int64) ([]Entry, error) {
    l.mu.RLock()
    defer l.mu.RUnlock()
    // ... same scan logic ...
}

// Append takes a write lock (unchanged semantics)
func (l *Log) Append(seq int64, data []byte) error {
    l.mu.Lock()
    defer l.mu.Unlock()
    // ... same append logic ...
}

// PruneUpTo takes write lock for ENTIRE operation (fixes the race)
func (l *Log) PruneUpTo(upTo int64) error {
    l.mu.Lock()
    defer l.mu.Unlock()

    // Inline the read (cannot call ReadFrom -- would deadlock)
    if err := l.w.Flush(); err != nil {
        return err
    }
    f, err := os.Open(l.path)
    if err != nil {
        return fmt.Errorf("open for read: %w", err)
    }
    defer f.Close()

    var remaining []Entry
    scanner := bufio.NewScanner(f)
    scanner.Buffer(make([]byte, 64*1024), 1024*1024)
    for scanner.Scan() {
        line := scanner.Bytes()
        if len(line) == 0 {
            continue
        }
        var e Entry
        if err := json.Unmarshal(line, &e); err != nil {
            return fmt.Errorf("parse entry: %w", err)
        }
        if e.Seq > upTo {
            remaining = append(remaining, e)
        }
    }
    if err := scanner.Err(); err != nil {
        return fmt.Errorf("scan: %w", err)
    }

    // Rewrite + rename (same as current, but now under continuous write lock)
    tmp := l.path + ".tmp"
    // ... same tmp write + rename + reopen logic ...
}
```

### WAL Concurrent Stress Test (DAEM-03)
```go
// Source: Decision D-09
func TestConcurrentAppendAndPrune(t *testing.T) {
    dir := t.TempDir()
    w, err := Open(filepath.Join(dir, "stress.jsonl"))
    if err != nil {
        t.Fatal(err)
    }
    defer w.Close()

    var wg sync.WaitGroup
    var seq atomic.Int64

    // N append goroutines
    for i := 0; i < 10; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            for j := 0; j < 100; j++ {
                s := seq.Add(1)
                _ = w.Append(s, []byte(`{"x":1}`))
            }
        }()
    }

    // M prune goroutines
    for i := 0; i < 3; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            for j := 0; j < 20; j++ {
                current := seq.Load()
                if current > 10 {
                    _ = w.PruneUpTo(current - 5)
                }
            }
        }()
    }

    wg.Wait()
    // Verify: all remaining entries have seq > last prune point
    // Run with: go test -race ./internal/wal/
}
```

### Welcome Replay in runOnce (DAEM-02)
```go
// Source: Derived from loop/daemon.go with decisions D-03, D-04, D-05
func (d *Daemon) runOnce(ctx context.Context) error {
    lastSeqs, err := wal.ScanDirectory(d.walDir)
    if err != nil {
        return fmt.Errorf("scan wal directory: %w", err)
    }

    welcome, err := d.client.Connect(ctx, lastSeqs)
    if err != nil {
        return fmt.Errorf("connect: %w", err)
    }

    // Replay un-acked WAL entries for each session
    for sessionID, ackedSeq := range welcome.AckedSequencesBySession {
        walPath := filepath.Join(d.walDir, sessionID+".jsonl")
        log, err := wal.Open(walPath)
        if err != nil {
            continue // WAL file may not exist
        }
        entries, err := log.ReadFrom(ackedSeq)
        if err != nil {
            log.Close()
            continue
        }
        for _, e := range entries {
            _ = d.client.Send(json.RawMessage(e.Data))
        }
        // Prune acked entries (D-04)
        _ = log.PruneUpTo(ackedSeq)
        log.Close()
    }

    // ... heartbeat + client.Run as before ...
}
```

### Signal Handler + Shutdown (DAEM-01)
```go
// Source: Derived from cmd/start.go with decisions D-01, D-02
// Option A: Expose Shutdown on Daemon
// In loop/daemon.go:
func (d *Daemon) Shutdown() {
    d.manager.StopAll()
}

// In cmd/start.go:
go func() {
    <-sigCh
    fmt.Println("\nShutting down...")
    d.Shutdown() // Kill all Claude processes immediately (D-02)
    cancel()     // Cancel context to stop the run loop
}()
```

### Pdeathsig (Linux-only) (DAEM-01)
```go
// Source: Decision D-01
// File: pty_linux.go (new file, split from pty_unix.go)
//go:build linux

func ptySysProcAttr() *syscall.SysProcAttr {
    return &syscall.SysProcAttr{
        Setsid:    true,
        Setctty:   true,
        Ctty:      1,
        Pdeathsig: syscall.SIGKILL,
    }
}
```

### Actor Cleanup in Manager (DAEM-04)
```go
// Source: Derived from manager.go with decisions D-06, D-07
// In the Spawn goroutine:
go func() {
    err := actor.Run(ctx)
    // Remove actor from manager regardless of success/error (D-06, D-07)
    m.mu.Lock()
    delete(m.actors, sessionID)
    m.mu.Unlock()
    _ = actor.Stop()

    if err == nil || ctx.Err() != nil {
        return
    }
    // ... existing TaskError relay send ...
}()
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Go testing + `-race` flag |
| Config file | None needed (Go convention) |
| Quick run command | `cd node/daemon && go test -race -count=1 ./internal/wal/ ./internal/session/ ./internal/loop/` |
| Full suite command | `cd node/daemon && go test -race -count=1 ./...` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DAEM-01 | Signal handler calls StopAll | unit/integration | `cd node/daemon && go test -race -run TestShutdown ./internal/loop/` | No -- Wave 0 |
| DAEM-01 | Pdeathsig set on Linux | unit | `cd node/daemon && go test -race -run TestPdeathsig ./internal/claude/` | No -- Wave 0 |
| DAEM-02 | Welcome replay sends un-acked entries | unit | `cd node/daemon && go test -race -run TestWelcomeReplay ./internal/loop/` | No -- Wave 0 |
| DAEM-02 | Welcome prunes acked entries | unit | `cd node/daemon && go test -race -run TestWelcomePrune ./internal/loop/` | No -- Wave 0 |
| DAEM-03 | Concurrent append+prune no race | stress | `cd node/daemon && go test -race -count=1 -run TestConcurrent ./internal/wal/` | No -- Wave 0 |
| DAEM-03 | PruneUpTo does not lose entries | unit | `cd node/daemon && go test -race -run TestPruneUpTo ./internal/wal/` | Yes (wal_test.go) |
| DAEM-04 | Actor removed from manager on Run exit | unit | `cd node/daemon && go test -race -run TestActorCleanup ./internal/session/` | No -- Wave 0 |
| DAEM-04 | Actor removed on Run error | unit | `cd node/daemon && go test -race -run TestActorErrorCleanup ./internal/session/` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd node/daemon && go test -race -count=1 ./internal/wal/ ./internal/session/`
- **Per wave merge:** `cd node/daemon && go test -race -count=1 ./...`
- **Phase gate:** Full suite green with `-race` before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `node/daemon/internal/wal/wal_test.go` -- add `TestConcurrentAppendAndPrune` (DAEM-03)
- [ ] `node/daemon/internal/loop/daemon_test.go` -- new file for welcome replay tests (DAEM-02)
- [ ] `node/daemon/internal/session/manager_test.go` -- new file for actor cleanup tests (DAEM-04)
- [ ] `node/daemon/internal/claude/pty_linux_test.go` -- Pdeathsig test (DAEM-01, Linux-only)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | N/A -- no auth changes in this phase |
| V3 Session Management | No | N/A -- session lifecycle bug fixes, not auth sessions |
| V4 Access Control | No | N/A |
| V5 Input Validation | No | N/A -- no new input paths |
| V6 Cryptography | No | N/A |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Orphaned child processes consuming resources | Denial of Service | Pdeathsig + signal handler (DAEM-01) |
| WAL data loss on concurrent access | Tampering / Information Disclosure | RWMutex with full-scope write lock (DAEM-03) |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `Pdeathsig` field does not exist on Darwin `SysProcAttr` | Pitfall 1 | Build failure on macOS if not split by build tag [VERIFIED: Go stdlib source] |
| A2 | Welcome replay for sessions with active actors should use actor's WAL handle, not open a new one | Pitfall 3 | WAL corruption if two Log instances write to same file [ASSUMED -- based on file locking analysis] |
| A3 | `executor.Close()` and `wal.Log.Close()` are safe to call twice (return error, no panic) | Pitfall 5 | Panic in concurrent shutdown path [ASSUMED -- based on Go os.File.Close behavior] |

## Open Questions

1. **Active actor WAL access during welcome replay**
   - What we know: Welcome replay needs to read and prune WAL files. Active actors already hold an open `wal.Log`.
   - What's unclear: Whether to route welcome replay through the active actor's `PruneWAL` method or open a second Log.
   - Recommendation: For sessions with active actors in `m.actors`, use `actor.PruneWAL(ackedSeq)` and read entries via a new method or the existing `handleReplay` pattern. For sessions with no active actor (WAL files from crashed sessions), open a new `wal.Log`. This avoids dual-writer issues.

2. **Exposing StopAll for signal handler**
   - What we know: `cmd/start.go` creates a `Daemon` but does not have direct access to `Manager`. The signal handler cancels the context but does not call `StopAll`.
   - What's unclear: Whether to add `Daemon.Shutdown()` or restructure `start.go`.
   - Recommendation: Add a `Shutdown()` method on `Daemon` that calls `d.manager.StopAll()`. Call it from the signal handler goroutine before canceling the context. Simple, minimal change.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Go | Build + test | Yes | 1.26.1 | -- |
| go test -race | DAEM-03 stress test | Yes | (built-in) | -- |

No missing dependencies.

## Sources

### Primary (HIGH confidence)
- `node/daemon/internal/wal/wal.go` -- WAL implementation, verified race condition in PruneUpTo
- `node/daemon/internal/session/manager.go` -- Manager.Spawn goroutine, verified missing actor cleanup
- `node/daemon/internal/session/actor.go` -- Actor lifecycle, Stop() sync.Once pattern
- `node/daemon/internal/loop/daemon.go` -- runOnce(), verified `_ = welcome` TODO
- `node/daemon/internal/claude/pty_unix.go` -- ptySysProcAttr(), verified no Pdeathsig
- `node/daemon/internal/claude/executor.go` -- Executor.Start/Close lifecycle
- `node/daemon/cmd/start.go` -- Signal handler, verified context-cancel-only pattern
- `node/protocol-go/messages.go` -- Welcome struct with AckedSequencesBySession field
- `node/daemon/internal/relay/client.go` -- Connect() returns *protocol.Welcome

### Secondary (MEDIUM confidence)
- Go sync.RWMutex documentation -- non-reentrant, read/write lock semantics [CITED: https://pkg.go.dev/sync#RWMutex]
- Linux prctl(PR_SET_PDEATHSIG) -- Pdeathsig kernel behavior [CITED: https://man7.org/linux/man-pages/man2/prctl.2.html]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all Go stdlib
- Architecture: HIGH -- all four bugs have clear root causes in verified source code with well-defined fixes from CONTEXT.md
- Pitfalls: HIGH -- all pitfalls derived from reading actual source code and Go stdlib documentation

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (stable Go codebase, no external dependencies)
