# Phase 2: Daemon Stabilization - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-09
**Phase:** 02-daemon-stabilization
**Areas discussed:** Orphan Prevention (DAEM-01), Welcome Resume Behavior (DAEM-02), Session Cleanup Policy (DAEM-04), WAL Concurrency Fix (DAEM-03)

---

## Orphan Prevention (DAEM-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Pdeathsig on Linux only | SysProcAttr.Pdeathsig = SIGKILL; OS-enforced, zero runtime cost, Linux only | |
| SIGTERM handler + process group kill | Catch SIGTERM/SIGINT, call StopAll(), kill process group; cross-platform | |
| Both — Pdeathsig + signal handler | Belt-and-suspenders; Pdeathsig for SIGKILL on Linux, signal handler for SIGTERM/macOS | ✓ |

**User's choice:** Both — Pdeathsig + signal handler

---

| Option | Description | Selected |
|--------|-------------|----------|
| Kill immediately | SIGTERM triggers StopAll(); no drain window | ✓ |
| Drain with timeout | Give Claude N seconds to finish output before kill | |

**User's choice:** Kill immediately — Claude doesn't have graceful mid-session shutdown

---

## Welcome Resume Behavior (DAEM-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Replay un-acked entries immediately | For each session in welcome's acked map, replay WAL entries with seq > acked_seq | ✓ |
| Wait for server to re-send Task messages | Daemon does nothing on welcome; server decides what to replay | |

**User's choice:** Replay un-acked entries immediately

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — prune on welcome | Server confirmed up to seq N → prune immediately | ✓ |
| No — only prune on explicit Ack messages | Let normal per-event Acks drive pruning | |

**User's choice:** Yes — prune immediately on welcome

---

## Session Cleanup Policy (DAEM-04)

| Option | Description | Selected |
|--------|-------------|----------|
| On completion + daemon shutdown | Remove actor when Run exits cleanly; also at StopAll() | ✓ |
| Daemon shutdown only | Keep actors alive until StopAll(); simpler | |

**User's choice:** On session completion + daemon shutdown

---

| Option | Description | Selected |
|--------|-------------|----------|
| Remove from manager + send TaskError | Remove on error exit so slot can be re-spawned | ✓ |
| Leave in map, send TaskError | Current behavior; leaves broken actor in map | |

**User's choice:** Remove from manager + send TaskError

---

## WAL Concurrency Fix (DAEM-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Single lock for full PruneUpTo operation | Internal readAllLocked(); PruneUpTo holds one lock for read+rewrite | |
| Separate read/write lock (sync.RWMutex) | RWMutex; reads concurrent, writes exclusive; more flexible | ✓ |

**User's choice:** sync.RWMutex

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — concurrent goroutines stress test | N appenders + M pruners, run with -race | ✓ |
| No — existing unit tests sufficient | | |

**User's choice:** Yes — add concurrent stress test

---
