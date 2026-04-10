---
phase: 5
slug: reliability-and-persistence
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| WAL-01 | 01 | 1 | RELY-05 | — | N/A | unit | `pytest tests/test_session_event.py -x -q` | ❌ W0 | ⬜ pending |
| WAL-02 | 01 | 1 | RELY-05 | — | N/A | unit | `pytest tests/test_wal_replay.py -x -q` | ❌ W0 | ⬜ pending |
| WAL-03 | 01 | 2 | SESS-05 | — | N/A | integration | `pytest tests/test_ws_replay_integration.py -x -q` | ❌ W0 | ⬜ pending |
| RECON-01 | 02 | 1 | SESS-05 | — | N/A | unit | `pnpm --filter frontend test run src/ws/reconnect.test.ts` | ❌ W0 | ⬜ pending |
| RECON-02 | 02 | 2 | SESS-05 | — | N/A | integration | `pytest tests/test_reconnect_replay.py -x -q` | ❌ W0 | ⬜ pending |
| FEED-01 | 03 | 1 | VIBE-06 | — | N/A | unit | `pytest tests/test_activity_broadcaster.py -x -q` | ❌ W0 | ⬜ pending |
| FEED-02 | 03 | 2 | VIBE-06 | — | N/A | unit | `pnpm --filter frontend test run src/components/activity-feed.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/backend/tests/test_session_event.py` — stubs for RELY-05 WAL storage
- [ ] `server/backend/tests/test_wal_replay.py` — stubs for sequence replay API
- [ ] `server/backend/tests/test_ws_replay_integration.py` — stubs for reconnect+replay flow
- [ ] `server/backend/tests/test_reconnect_replay.py` — stubs for node-side reconnection
- [ ] `server/backend/tests/test_activity_broadcaster.py` — stubs for SSE broadcaster
- [ ] `server/frontend/src/ws/reconnect.test.ts` — stubs for GsdWebSocket reconnect behavior
- [ ] `server/frontend/src/components/activity-feed.test.tsx` — stubs for feed component

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
