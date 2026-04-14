---
phase: 15
slug: redis-multi-worker-and-deploy-modal
status: compliant
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-13
audited: 2026-04-13
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
| 15-01-01 | 01 | 1 | SCAL-01 | — | N/A | unit | `pytest tests/relay/test_subscriber_retry.py -x -q` | ✅ | ✅ green |
| 15-01-02 | 01 | 1 | SCAL-01 | — | N/A | unit | `pytest tests/relay/test_subscriber_retry.py -x -q` | ✅ | ✅ green |
| 15-01-03 | 01 | 1 | SCAL-01 | — | N/A | integration | `pytest tests/relay/test_subscriber_retry.py -x -q` | ✅ | ✅ green |
| 15-02-01 | 02 | 1 | UX-01 | — | Code single-use enforced | unit | `pytest tests/api/routes/test_daemon_pair.py tests/api/routes/test_nodes.py -x -q` | ✅ | ✅ green |
| 15-02-02 | 02 | 1 | UX-01 | — | Code expires after 10m | unit | `pytest tests/api/routes/test_daemon_pair.py tests/api/routes/test_nodes.py -x -q` | ✅ | ✅ green |
| 15-02-03 | 02 | 2 | UX-01 | — | N/A | component | `pnpm test run src/components/nodes/` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `server/backend/tests/relay/test_subscriber_retry.py` — SCAL-01 retry behavior (5 tests)
- [x] `server/backend/tests/api/routes/test_daemon_pair.py` — pairing single-use + invalid code (4 tests)
- [x] `server/backend/tests/api/routes/test_nodes.py` — pairing code endpoint (3 tests)
- [x] `server/frontend/src/components/nodes/__tests__/deploy-modal.test.tsx` — UX-01 modal (6 tests)

*All Wave 0 test files created and passing. 21 backend + 6 frontend = 27 total.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Deploy modal shows OS-aware tabs and copy buttons | UX-01 | Visual UI behavior | Open Nodes page, click "Deploy on new node", verify macOS/Linux tabs with copy buttons |
| Live connection indicator updates on node connect | UX-01 | Requires real daemon | Paste commands on a test machine, verify modal shows success and auto-closes |
| docker-compose.multiworker.yml starts 2 backend replicas | SCAL-01 | Requires Docker | Run `docker compose -f docker-compose.yml -f docker-compose.multiworker.yml up`, verify 2 backend containers |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** 2026-04-13

---

## Validation Audit 2026-04-13

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
| Tests run | 27 (21 backend + 6 frontend) |
| Suite result | all green |
