---
phase: 15
slug: redis-multi-worker-and-deploy-modal
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-13
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (backend) + vitest (frontend) |
| **Config file** | `server/backend/pyproject.toml` / `server/frontend/vitest.config.ts` |
| **Quick run command** | `cd server/backend && python -m pytest tests/ -x -q` |
| **Full suite command** | `cd server/backend && python -m pytest tests/ && cd ../frontend && pnpm test run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd server/backend && python -m pytest tests/ -x -q`
- **After every plan wave:** Run `cd server/backend && python -m pytest tests/ && cd ../frontend && pnpm test run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | SCAL-01 | — | N/A | unit | `pytest tests/test_subscriber_retry.py -x -q` | ❌ W0 | ⬜ pending |
| 15-01-02 | 01 | 1 | SCAL-01 | — | N/A | unit | `pytest tests/test_subscriber_retry.py -x -q` | ❌ W0 | ⬜ pending |
| 15-01-03 | 01 | 1 | SCAL-01 | — | N/A | integration | `pytest tests/test_multiworker_relay.py -x -q` | ❌ W0 | ⬜ pending |
| 15-02-01 | 02 | 1 | UX-01 | — | Code single-use enforced | unit | `pytest tests/test_nodes_pair.py -x -q` | ❌ W0 | ⬜ pending |
| 15-02-02 | 02 | 1 | UX-01 | — | Code expires after 10m | unit | `pytest tests/test_nodes_pair.py -x -q` | ❌ W0 | ⬜ pending |
| 15-02-03 | 02 | 2 | UX-01 | — | N/A | component | `pnpm test run src/components/nodes/` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/backend/tests/test_subscriber_retry.py` — stubs for SCAL-01 retry behavior
- [ ] `server/backend/tests/test_multiworker_relay.py` — stubs for cross-worker relay
- [ ] `server/backend/tests/test_nodes_pair.py` — stubs for pairing code endpoints (UX-01)

*Existing backend pytest infrastructure covers framework; test files need creation.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Deploy modal shows OS-aware tabs and copy buttons | UX-01 | Visual UI behavior | Open Nodes page, click "Deploy on new node", verify macOS/Linux tabs with copy buttons |
| Live connection indicator updates on node connect | UX-01 | Requires real daemon | Paste commands on a test machine, verify modal shows success and auto-closes |
| docker-compose.multiworker.yml starts 2 backend replicas | SCAL-01 | Requires Docker | Run `docker compose -f docker-compose.yml -f docker-compose.multiworker.yml up`, verify 2 backend containers |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
