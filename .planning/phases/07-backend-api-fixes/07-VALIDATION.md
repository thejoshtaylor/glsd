---
phase: 7
slug: backend-api-fixes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-09
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 7.x |
| **Config file** | `server/backend/pyproject.toml` |
| **Quick run command** | `cd server/backend && python -m pytest tests/test_auth.py tests/test_nodes.py tests/test_sessions.py -x -q 2>/dev/null || python -m pytest tests/ -x -q` |
| **Full suite command** | `cd server/backend && python -m pytest tests/ -q` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | AUTH-05 | — | Node endpoint returns 404 for unknown IDs | unit | `cd server/backend && python -m pytest tests/ -k "test_get_node" -q` | ❌ W0 | ⬜ pending |
| 07-01-02 | 01 | 1 | SESS-06 | — | Sessions filtered by node_id correctly | unit | `cd server/backend && python -m pytest tests/ -k "test_list_sessions_by_node" -q` | ❌ W0 | ⬜ pending |
| 07-01-03 | 01 | 1 | SESS-01 | — | SessionPublic includes channel_id field | unit | `cd server/backend && python -m pytest tests/ -k "test_session_channel_id" -q` | ❌ W0 | ⬜ pending |
| 07-01-04 | 01 | 2 | AUTH-06 | — | xfail stubs converted to real passing tests | unit | `cd server/backend && python -m pytest tests/test_auth.py -q` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_nodes.py` — GET /api/v1/nodes/{node_id} endpoint tests (AUTH-05)
- [ ] `tests/test_sessions.py` — node_id filter and channel_id field tests (SESS-06, SESS-01)

*Existing test_auth.py already exists; xfail conversion is Wave 2 work.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| NodeDetailPage renders without error | VIBE-04 | Requires running frontend + backend together | Start server, navigate to /nodes/{id}, confirm no 404 or console error |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
