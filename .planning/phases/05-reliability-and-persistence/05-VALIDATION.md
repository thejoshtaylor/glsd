---
phase: 5
slug: reliability-and-persistence
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-09
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 7.x (server) + vitest (frontend) + go test (node) |
| **Config file** | `server/backend/pyproject.toml` / `server/frontend/vite.config.ts` |
| **Quick run command** | `cd server/backend && python -m pytest tests/ -x -q` |
| **Full suite command** | `cd server/backend && python -m pytest tests/ && cd ../../server/frontend && pnpm test run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd server/backend && python -m pytest tests/ -x -q`
- **After every plan wave:** Run full suite (backend + frontend)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-T1 | 01 | 1 | RELY-05, SESS-05 | — | N/A | unit (TDD inline) | `python -m pytest tests/test_broadcaster.py tests/ws/test_browser_replay.py -x -q` | ❌ created in task | ⬜ pending |
| 05-01-T2 | 01 | 1 | VIBE-06 | — | N/A | unit | `python -m pytest tests/api/routes/test_activity.py tests/test_broadcaster.py -x -q` | ❌ created in task | ⬜ pending |
| 05-02-T1 | 02 | 1 | SESS-05 | — | N/A | type-check | `npx tsc --noEmit 2>&1 \| head -30` | ✅ existing | ⬜ pending |
| 05-02-T2 | 02 | 1 | SESS-05, RELY-05 | — | N/A | type-check | `npx tsc --noEmit 2>&1 \| head -30` | ✅ existing | ⬜ pending |
| 05-03-T1 | 03 | 2 | VIBE-06 | — | N/A | type-check | `npx tsc --noEmit 2>&1 \| head -30` | ✅ existing | ⬜ pending |
| 05-03-T2 | 03 | 2 | VIBE-06 | — | N/A | manual | checkpoint:human-verify | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Wave 0 is handled inline via TDD in Plan 05-01 Task 1 (tdd="true"). Tests are written before implementation within the same task — no separate Wave 0 plan is needed.

Test files created during execution:
- [x] `server/backend/tests/test_broadcaster.py` — ActivityBroadcaster unit tests (Plan 01, Task 1)
- [x] `server/backend/tests/ws/test_browser_replay.py` — replay handler tests (Plan 01, Task 1)
- [x] `server/backend/tests/api/routes/test_activity.py` — SSE/REST activity endpoint tests (Plan 01, Task 2)

Existing infrastructure covers Plans 02 and 03 (TypeScript type checking via `tsc --noEmit`).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Browser refresh mid-session catches up | SESS-05 | Requires live WebSocket session | Start session, send messages, refresh browser, verify stream resumes from correct sequence |
| Node daemon reconnects after server restart | RELY-05 | Requires process restart | Kill server, restart, verify node reconnects and buffered messages delivered |
| Activity feed live stream across nodes | VIBE-06 | Multi-node E2E | Connect two nodes, start sessions, verify both appear in activity feed in real-time |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
