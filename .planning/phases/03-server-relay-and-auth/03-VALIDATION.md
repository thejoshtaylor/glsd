---
phase: 3
slug: server-relay-and-auth
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-09
validated: 2026-04-10
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 7.x |
| **Config file** | `server/backend/pyproject.toml` (pytest section) |
| **Quick run command** | `cd server/backend && python -m pytest tests/ -x -q` |
| **Full suite command** | `cd server/backend && python -m pytest tests/ -v` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd server/backend && python -m pytest tests/ -x -q`
- **After every plan wave:** Run `cd server/backend && python -m pytest tests/ -v`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 3-auth-01 | auth | 1 | AUTH-01 | — | User signup rejects duplicate email | unit | `pytest tests/api/routes/test_auth.py -x -q` | ✅ | ✅ green |
| 3-auth-02 | auth | 1 | AUTH-02 | — | Login returns JWT; invalid creds return 401 | unit | `pytest tests/api/routes/test_auth.py -x -q` | ✅ | ✅ green |
| 3-auth-03 | auth | 1 | AUTH-03 | — | JWT refresh token roundtrip | unit | `pytest tests/api/routes/test_auth.py -x -q` | ✅ | ✅ green |
| 3-auth-04 | auth | 1 | AUTH-04 | — | Logout invalidates token | unit | `pytest tests/api/routes/test_auth.py -x -q` | ✅ | ✅ green |
| 3-nodes-01 | nodes | 1 | RELY-01 | — | Pairing token revealed once, hash stored in DB | unit | `pytest tests/api/routes/test_nodes.py -x -q` | ✅ | ✅ green |
| 3-nodes-02 | nodes | 1 | RELY-01 | — | Revocation immediately closes WS, marks token revoked | integration | `pytest tests/api/routes/test_nodes.py -x -q` | ✅ | ✅ green |
| 3-nodes-03 | nodes | 2 | RELY-02 | — | Daemon WS auth accepted via header or query param | integration | `pytest tests/ws/test_node_relay.py -x -q` | ✅ | ✅ green |
| 3-relay-01 | relay | 2 | RELY-03 | — | Browser WS JWT query param auth accepted | integration | `pytest tests/ws/test_browser_relay.py -x -q` | ✅ | ✅ green |
| 3-relay-02 | relay | 2 | RELY-04 | — | channelId routing: browser msg arrives at correct node | integration | `pytest tests/ws/test_browser_relay.py -x -q` | ✅ | ✅ green |
| 3-sess-01 | sessions | 2 | SESS-01 | — | POST /sessions creates DB record, returns sessionId | unit | `pytest tests/api/routes/test_sessions.py -x -q` | ✅ | ✅ green |
| 3-sess-02 | sessions | 2 | SESS-02 | — | Session stop forwards stop msg to node WS | integration | `pytest tests/api/routes/test_sessions.py -x -q` | ✅ | ✅ green |
| 3-events-01 | events | 2 | SESS-06 | — | Every stream event written to session_events table | integration | `pytest tests/ws/test_event_storage.py -x -q` | ✅ | ✅ green |
| 3-events-02 | events | 2 | SESS-06 | — | ack sent after DB write confirms (not fire-and-forget) | integration | `pytest tests/ws/test_event_storage.py -x -q` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Note on file existence audit (2026-04-10):**
All Wave 0 test files exist:
- `server/backend/tests/api/routes/test_auth.py` — EXISTS
- `server/backend/tests/api/routes/test_nodes.py` — EXISTS
- `server/backend/tests/api/routes/test_sessions.py` — EXISTS
- `server/backend/tests/ws/test_node_relay.py` — EXISTS
- `server/backend/tests/ws/test_browser_relay.py` — EXISTS
- `server/backend/tests/ws/test_event_storage.py` — EXISTS
- `server/backend/tests/conftest.py` — EXISTS

Full pytest run: **119 passed, 0 failed** (6.06s). Tests confirmed running against live PostgreSQL via `postgresql+psycopg` engine (no SQLite).

---

## Wave 0 Requirements

- [x] `server/backend/tests/api/routes/test_auth.py` — stubs for AUTH-01 through AUTH-04 — EXISTS and passing
- [x] `server/backend/tests/api/routes/test_nodes.py` — stubs for RELY-01 (token pairing, revocation) — EXISTS and passing
- [x] `server/backend/tests/api/routes/test_sessions.py` — stubs for SESS-01, SESS-02 — EXISTS and passing
- [x] `server/backend/tests/ws/test_node_relay.py` — stubs for RELY-02 (node WS auth + routing) — EXISTS and passing
- [x] `server/backend/tests/ws/test_browser_relay.py` — stubs for RELY-03, RELY-04 (browser WS auth + channelId routing) — EXISTS and passing
- [x] `server/backend/tests/ws/test_event_storage.py` — stubs for SESS-06 (event persistence + ack timing) — EXISTS and passing
- [x] `server/backend/tests/conftest.py` — shared fixtures (async DB session, test client, mock WS connections) — EXISTS

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pairing token shown once in UI | AUTH-03 / D-02 | Frontend not built until Phase 4 | After `POST /api/v1/nodes/tokens`, verify response body contains `raw_token` field and a second GET returns only hashed representation |
| Node heartbeat updates last_seen | RELY-02 / D-12 | Requires real daemon WebSocket connection | Connect daemon, send heartbeat frame, query nodes table: `last_seen` must update within 1s |
| End-to-end relay smoke test | RELY-03/04 | Requires real browser + real daemon | Open browser WebSocket, send task message, verify frame arrives at daemon; daemon sends taskStarted, verify frame arrives at browser |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (all 7 Wave 0 files created and passing)
- [x] No watch-mode flags
- [x] Feedback latency < 30s (pytest suite: ~6s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-04-10

---

## Nyquist Compliance Note

`nyquist_compliant: true` reflects complete strategy and full Wave 0 implementation. All 13 per-task test commands map to existing test files. Full pytest suite runs 119 tests against live PostgreSQL (postgresql+psycopg — no SQLite) and passes clean. This satisfies ROADMAP SC4 (Nyquist validation for Phase 3) and contributes evidence for SC5 (pytest against live PostgreSQL).
