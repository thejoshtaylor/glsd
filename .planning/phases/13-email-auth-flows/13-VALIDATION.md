---
phase: 13
slug: email-auth-flows
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-12
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 7.x (backend) / vitest (frontend) |
| **Config file** | `server/backend/pyproject.toml` / `server/frontend/vitest.config.ts` |
| **Quick run command** | `cd server/backend && python -m pytest tests/ -x -q --timeout=30` |
| **Full suite command** | `cd server/backend && python -m pytest tests/ -v --timeout=60` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd server/backend && python -m pytest tests/ -x -q --timeout=30`
- **After every plan wave:** Run `cd server/backend && python -m pytest tests/ -v --timeout=60`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | AUTH-07 | T-13-01 / — | Password reset token expires after 1h, single-use | unit | `pytest tests/test_password_reset.py` | ❌ W0 | ⬜ pending |
| 13-01-02 | 01 | 1 | AUTH-08 | T-13-02 / — | Verification token is single-use, marks email_verified=True | unit | `pytest tests/test_email_verification.py` | ❌ W0 | ⬜ pending |
| 13-02-01 | 02 | 2 | AUTH-08 | — | Unverified users see banner, read-only after 7 days | integration | `pytest tests/test_verification_enforcement.py` | ❌ W0 | ⬜ pending |
| 13-02-02 | 02 | 2 | AUTH-08 | T-13-03 / — | Existing v1.0 users default to verified=True | migration | `pytest tests/test_migration_safety.py` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_password_reset.py` — stubs for AUTH-07 password reset flow
- [ ] `tests/test_email_verification.py` — stubs for AUTH-08 verification flow
- [ ] `tests/test_verification_enforcement.py` — stubs for 7-day read-only enforcement
- [ ] `tests/test_migration_safety.py` — stubs for v1.0 user migration safety

*Existing pytest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Email delivery to real inbox | AUTH-07, AUTH-08 | Requires SMTP integration | 1. Configure SMTP, 2. Trigger reset/verify, 3. Check inbox |
| Frontend banner rendering | AUTH-08 | Visual UI check | 1. Login as unverified user, 2. Verify banner shows, 3. Check read-only after 7 days |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
