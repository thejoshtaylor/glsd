---
phase: 14
slug: web-push-notifications
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-13
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 7.x (backend) / vitest (frontend) / browser manual (SW) |
| **Config file** | `server/backend/pyproject.toml` / `server/frontend/vitest.config.ts` |
| **Quick run command** | `cd server/backend && python -m pytest tests/ -x -q --timeout=30` |
| **Full suite command** | `cd server/backend && python -m pytest tests/ -q && cd ../../server/frontend && npx vitest run` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd server/backend && python -m pytest tests/ -x -q --timeout=30`
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | NOTF-01 | T-14-01 | VAPID keys never logged or exposed in API responses | unit | `pytest tests/test_push_service.py -k test_vapid` | ❌ W0 | ⬜ pending |
| 14-01-02 | 01 | 1 | NOTF-01 | T-14-02 | Push subscription endpoint validates auth | unit | `pytest tests/test_push_routes.py -k test_subscribe_auth` | ❌ W0 | ⬜ pending |
| 14-02-01 | 02 | 1 | NOTF-01 | — | N/A | integration | `pytest tests/test_push_dispatch.py -k test_permission_request_triggers_push` | ❌ W0 | ⬜ pending |
| 14-02-02 | 02 | 1 | NOTF-02 | — | N/A | integration | `pytest tests/test_push_dispatch.py -k test_task_complete_triggers_push` | ❌ W0 | ⬜ pending |
| 14-03-01 | 03 | 2 | NOTF-01 | T-14-03 | Push respond endpoint validates JWT from payload | unit | `pytest tests/test_push_routes.py -k test_respond_auth` | ❌ W0 | ⬜ pending |
| 14-04-01 | 04 | 2 | NOTF-02 | — | N/A | component | `cd server/frontend && npx vitest run --reporter=verbose src/pages/settings.test.tsx` | ❌ W0 | ⬜ pending |
| 14-05-01 | 05 | 3 | NOTF-02 | — | N/A | manual | Browser PWA install + background notification test | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/backend/tests/test_push_service.py` — stubs for VAPID generation and push dispatch
- [ ] `server/backend/tests/test_push_routes.py` — stubs for subscription CRUD and push respond endpoints
- [ ] `server/backend/tests/test_push_dispatch.py` — stubs for ws_node.py push integration
- [ ] `server/frontend/src/pages/settings.test.tsx` — stubs for Notifications tab toggle behavior
- [ ] `pywebpush` added to test dependencies

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PWA installability | NOTF-02 | Requires real browser + manifest served over HTTPS/localhost | 1. Open app in Chrome. 2. Check DevTools > Application > Manifest. 3. Verify install prompt appears. |
| Background push delivery | NOTF-01 | Requires real push service + backgrounded browser tab | 1. Subscribe to push. 2. Background the tab. 3. Trigger a permissionRequest from node. 4. Verify OS notification appears. |
| Service worker action buttons | NOTF-01 | Requires real notification interaction | 1. Receive push notification. 2. Click Approve/Deny. 3. Verify API call succeeds and notification dismisses. |
| Mobile PWA notification | NOTF-02 | Requires physical mobile device or emulator | 1. Install PWA on mobile. 2. Background the app. 3. Trigger event. 4. Verify notification appears. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
