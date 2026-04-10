---
phase: 2
slug: daemon-stabilization
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-09
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
| 2-02-01 | 02 | 1 | DAEM-02 | — | Welcome replay sends un-acked entries | unit | `cd node/daemon && go test -race -run TestWelcomeReplay ./internal/loop/` | ❌ W0 | ⬜ pending |
| 2-02-02 | 02 | 1 | DAEM-02 | — | Welcome prunes acked entries | unit | `cd node/daemon && go test -race -run TestWelcomePrune ./internal/loop/` | ❌ W0 | ⬜ pending |
| 2-03-01 | 03 | 1 | DAEM-03 | T-2-02 | Concurrent append+prune no data race | stress | `cd node/daemon && go test -race -count=1 -run TestConcurrent ./internal/wal/` | ❌ W0 | ⬜ pending |
| 2-03-02 | 03 | 1 | DAEM-03 | T-2-02 | PruneUpTo does not lose entries | unit | `cd node/daemon && go test -race -run TestPruneUpTo ./internal/wal/` | ✅ | ⬜ pending |
| 2-04-01 | 04 | 1 | DAEM-04 | — | Actor removed from manager on Run exit | unit | `cd node/daemon && go test -race -run TestActorCleanup ./internal/session/` | ❌ W0 | ⬜ pending |
| 2-04-02 | 04 | 1 | DAEM-04 | — | Actor removed from manager on Run error | unit | `cd node/daemon && go test -race -run TestActorErrorCleanup ./internal/session/` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `node/daemon/internal/wal/wal_test.go` — add `TestConcurrentAppendAndPrune` stress test (DAEM-03)
- [ ] `node/daemon/internal/loop/daemon_test.go` — new file: welcome replay + prune tests (DAEM-02)
- [ ] `node/daemon/internal/session/manager_test.go` — new file: actor cleanup tests (DAEM-04)
- [ ] `node/daemon/internal/claude/pty_linux_test.go` — new file: Pdeathsig set test, Linux build tag (DAEM-01)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| No orphaned PIDs after `kill -9` on daemon | DAEM-01 | Pdeathsig only fires on Linux; macOS dev path uses signal handler | Run daemon on Linux node, spawn a session, `kill -9 <daemon-pid>`, verify `ps aux` shows no lingering `claude` processes |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
