---
phase: 11
slug: foundation-migrations-and-stub-cleanup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-11
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 7.x (backend) / vitest (frontend) |
| **Config file** | `server/backend/pyproject.toml` / `server/frontend/vite.config.ts` |
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
| 11-01-01 | 01 | 1 | FIX-01 | — | Migration applies without data loss | integration | `alembic upgrade head && alembic check` | ❌ W0 | ⬜ pending |
| 11-01-02 | 01 | 1 | FIX-01 | — | node.token_hash column exists | integration | `cd server/backend && python -m pytest tests/test_migrations.py -x -q` | ❌ W0 | ⬜ pending |
| 11-02-01 | 02 | 2 | FIX-02 | — | No Tauri imports in active cloud routes | unit | `cd server/frontend && pnpm test run` | ❌ W0 | ⬜ pending |
| 11-03-01 | 03 | 3 | FIX-03 | — | Email send failure raises HTTPException | unit | `cd server/backend && python -m pytest tests/test_email.py -x -q` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/backend/tests/test_migrations.py` — stubs for FIX-01 migration coverage
- [ ] `server/backend/tests/test_email.py` — stubs for FIX-03 email error surfacing
- [ ] `server/frontend/src/__tests__/tauri-stubs.test.ts` — stubs for FIX-02 Tauri removal

*Existing infrastructure assumed; Wave 0 adds missing test files.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Nodes page loads without 500 on upgraded DB | FIX-01 | Requires live DB upgrade from v1.0 | Start server with v1.0 DB, run `alembic upgrade head`, navigate to /nodes |
| No "not available" Tauri messages in UI | FIX-02 | Visual inspection required | Browse all cloud UI routes, check for Tauri error banners |
| SMTP misconfiguration shows user error | FIX-03 | Requires SMTP config testing | Set invalid SMTP host, trigger email send, verify error shown in UI |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
