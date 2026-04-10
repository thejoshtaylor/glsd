---
phase: 10
slug: phase-verification-closure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-10
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (backend) + vitest (frontend) |
| **Config file** | `server/backend/pyproject.toml` |
| **Quick run command** | `cd server/backend && python -m pytest tests/test_foundation.py --noconftest -q` |
| **Full suite command** | `cd server/backend && python -m pytest tests/ -x -q` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd server/backend && python -m pytest tests/test_foundation.py --noconftest -q`
- **After every plan wave:** Run `cd server/backend && python -m pytest tests/ -x -q`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | AUTH-05, AUTH-06, SESS-03, SESS-04, VIBE-01, VIBE-02, VIBE-03, VIBE-04, VIBE-05, SESS-05, RELY-05, VIBE-06 | — | N/A — documentation phase | code inspection | `test -f .planning/phases/04-frontend-integration/04-VERIFICATION.md` | ✅ | ⬜ pending |
| 10-01-02 | 01 | 1 | SESS-05, RELY-05, VIBE-06 | — | N/A — documentation phase | code inspection | `test -f .planning/phases/05-reliability-and-persistence/05-VERIFICATION.md` | ✅ | ⬜ pending |
| 10-01-03 | 01 | 2 | AUTH-05, AUTH-06, SESS-03, SESS-04, VIBE-01, VIBE-02, VIBE-03, VIBE-04, VIBE-05 | — | N/A — documentation phase | grep | `grep -c "\[x\]" .planning/REQUIREMENTS.md` | ✅ | ⬜ pending |
| 10-01-04 | 01 | 2 | ALL | — | N/A — documentation phase | cli | `cd server/backend && python -m pytest tests/ -x -q` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements. This phase creates verification documentation, not test infrastructure.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Nyquist validation for phases 2, 3, 4 | ALL | Requires running `/gsd-validate-phase` workflow commands | Run `/gsd-validate-phase 2`, `/gsd-validate-phase 3`, `/gsd-validate-phase 4` and confirm each passes |
| Full pytest suite against live PostgreSQL | SESS-05, RELY-05, VIBE-06 | Requires running Docker Compose | Run `docker compose up -d` then `cd server/backend && python -m pytest tests/ -x -q` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
