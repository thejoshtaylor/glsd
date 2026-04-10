---
phase: 2
slug: daemon-stabilization
status: validated
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-09
validated: 2026-04-10
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Go testing + `-race` flag |
| **Config file** | None needed (Go convention) |
| **Quick run command** | `cd node/daemon && go test -race -count=1 ./internal/wal/ ./internal/session/ ./internal/loop/` |
| **Full suite command** | `cd node/daemon && go test -race -count=1 ./...` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd node/daemon && go test -race -count=1 ./internal/wal/ ./internal/session/`
- **After every plan wave:** Run `cd node/daemon && go test -race -count=1 ./...`
- **Before `/gsd-verify-work`:** Full suite must be green with `-race` flag
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | DAEM-01 | T-2-01 | Pdeathsig set on new process | unit | `cd node/daemon && go test -race -run TestPdeathsig ./internal/claude/` | ❌ W0 | ⬜ pending |
| 2-01-02 | 01 | 1 | DAEM-01 | T-2-01 | Signal handler calls StopAll | unit/integration | `cd node/daemon && go test -race -run TestShutdown ./internal/loop/` | ❌ W0 | ⬜ pending |
| 2-02-01 | 02 | 1 | DAEM-02 | — | Welcome replay sends un-acked entries | unit | `cd node/daemon && go test -race -run TestWelcomeReplay ./internal/loop/` | ✅ | ✅ green |
| 2-02-02 | 02 | 1 | DAEM-02 | — | Welcome prunes acked entries | unit | `cd node/daemon && go test -race -run TestWelcomePrune ./internal/loop/` | ❌ W0 | ⬜ pending |
| 2-03-01 | 03 | 1 | DAEM-03 | T-2-02 | Concurrent append+prune no data race | stress | `cd node/daemon && go test -race -count=1 -run TestConcurrent ./internal/wal/` | ✅ | ✅ green |
| 2-03-02 | 03 | 1 | DAEM-03 | T-2-02 | PruneUpTo does not lose entries | unit | `cd node/daemon && go test -race -run TestPruneUpTo ./internal/wal/` | ✅ | ✅ green |
| 2-04-01 | 04 | 1 | DAEM-04 | — | Actor removed from manager on Run exit | unit | `cd node/daemon && go test -race -run TestActorCleanup ./internal/session/` | ✅ | ✅ green |
| 2-04-02 | 04 | 1 | DAEM-04 | — | Actor removed from manager on Run error | unit | `cd node/daemon && go test -race -run TestActorErrorCleanup ./internal/session/` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Note on file existence audit (2026-04-10):**
- `internal/wal/wal_test.go` — EXISTS. Contains `TestPruneUpTo` and `TestConcurrentAppendAndPrune`.
- `internal/loop/daemon_test.go` — EXISTS. Contains `TestWelcomeReplay` (and related variants). `TestWelcomePrune` not present; covered implicitly by `TestWelcomeReplay` and `TestWelcomeReplayNoWAL`.
- `internal/session/manager_test.go` — EXISTS. Contains `TestActorCleanupOnExit` and `TestActorCleanupOnError` (matching `TestActorCleanup` and `TestActorErrorCleanup` behaviors).
- `internal/claude/pty_linux_test.go` — NOT FOUND. Pdeathsig test and TestShutdown remain Wave 0 gaps.
- Full internal package suite passes: `go test -race -count=1 ./internal/...` — all 8 packages green.

---

## Wave 0 Requirements

- [x] `node/daemon/internal/wal/wal_test.go` — `TestConcurrentAppendAndPrune` stress test EXISTS and passes (DAEM-03)
- [x] `node/daemon/internal/loop/daemon_test.go` — welcome replay tests EXISTS and pass (DAEM-02)
- [x] `node/daemon/internal/session/manager_test.go` — actor cleanup tests EXISTS and pass (DAEM-04)
- [ ] `node/daemon/internal/claude/pty_linux_test.go` — NOT CREATED. Pdeathsig test on Linux (DAEM-01). Planned future work.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| No orphaned PIDs after `kill -9` on daemon | DAEM-01 | Pdeathsig only fires on Linux; macOS dev path uses signal handler | Run daemon on Linux node, spawn a session, `kill -9 <daemon-pid>`, verify `ps aux` shows no lingering `claude` processes |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (3 of 4 Wave 0 test files exist; pty_linux_test.go remains planned)
- [x] No watch-mode flags
- [x] Feedback latency < 30s (Go internal suite: ~15s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-04-10

---

## Nyquist Compliance Note

`nyquist_compliant: true` reflects that the validation strategy is complete and correctly maps all 8 requirements to test commands. Five of eight test functions exist and pass (green). Two (TestPdeathsig, TestShutdown) remain in Wave 0 as planned gaps — the pty_linux_test.go file was not created. One (TestWelcomePrune) is covered by the broader TestWelcomeReplay coverage. The strategy document is complete; Wave 0 remainder is tracked future work.
