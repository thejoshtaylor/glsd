---
phase: 4
slug: frontend-integration
status: validated
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-09
validated: 2026-04-10
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (already configured in gsd-vibe) |
| **Config file** | `server/frontend/vite.config.ts` (vitest config inline) |
| **Quick run command** | `cd server/frontend && pnpm test --run` |
| **Full suite command** | `cd server/frontend && pnpm test --run && pnpm build` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd server/frontend && pnpm test --run`
- **After every plan wave:** Run `cd server/frontend && pnpm test --run && pnpm build`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | VIBE-01 | — | No Tauri imports compile | build | `cd server/frontend && pnpm build` | ✅ (build passes) | ✅ green |
| 04-01-02 | 01 | 1 | VIBE-01 | — | lib/api modules export expected functions | unit | `cd server/frontend && pnpm test --run` | ❌ W0 | ⬜ pending |
| 04-02-01 | 02 | 1 | AUTH-05 | T-04-01 | Login form rejects empty credentials | unit | `cd server/frontend && pnpm test --run` | ❌ W0 | ⬜ pending |
| 04-02-02 | 02 | 1 | AUTH-06 | T-04-01 | ProtectedRoute redirects unauthenticated | unit | `cd server/frontend && pnpm test --run` | ❌ W0 | ⬜ pending |
| 04-03-01 | 03 | 2 | SESS-03 | — | useCloudSession hook creates session via API | unit | `cd server/frontend && pnpm test --run` | ❌ W0 | ⬜ pending |
| 04-03-02 | 03 | 2 | SESS-04 | — | Terminal renders stream output | unit | `cd server/frontend && pnpm test --run` | ❌ W0 | ⬜ pending |
| 04-04-01 | 04 | 2 | VIBE-02 | — | Node list loads from API | unit | `cd server/frontend && pnpm test --run` | ❌ W0 | ⬜ pending |
| 04-04-02 | 04 | 2 | VIBE-03 | — | Node revocation mutation works | unit | `cd server/frontend && pnpm test --run` | ❌ W0 | ⬜ pending |
| 04-05-01 | 05 | 3 | VIBE-04 | — | File browser loads directory listing | unit | `cd server/frontend && pnpm test --run` | ❌ W0 | ⬜ pending |
| 04-05-02 | 05 | 3 | VIBE-05 | — | Permission request UI renders | unit | `cd server/frontend && pnpm test --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Note on file existence audit (2026-04-10):**
- `server/frontend/src/__tests__/` — directory does NOT exist. All unit test files remain Wave 0 planned work.
- Build verification: `pnpm build` passes successfully (dist output confirmed, built in ~3.4s). Task 04-01-01 (no Tauri imports compile) is satisfied by the build passing.
- The 9 unit test tasks (04-01-02 through 04-05-02) all require Wave 0 test files that have not been created.

---

## Wave 0 Requirements

- [ ] `server/frontend/src/__tests__/api-client.test.ts` — stubs for VIBE-01 (no Tauri, lib/api exports) — NOT CREATED
- [ ] `server/frontend/src/__tests__/auth.test.tsx` — stubs for AUTH-05, AUTH-06 (login form, ProtectedRoute) — NOT CREATED
- [ ] `server/frontend/src/__tests__/session.test.tsx` — stubs for SESS-03, SESS-04 (useCloudSession hook) — NOT CREATED
- [ ] `server/frontend/src/__tests__/nodes.test.tsx` — stubs for VIBE-02, VIBE-03 (node list, revoke) — NOT CREATED
- [ ] `server/frontend/src/__tests__/filesystem.test.tsx` — stubs for VIBE-04 (file browser) — NOT CREATED
- [ ] `server/frontend/src/__tests__/permissions.test.tsx` — stubs for VIBE-05 (permission request) — NOT CREATED

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| xterm.js terminal renders Claude Code output live | SESS-03 | WebSocket stream requires live server/node | Connect a real node, start a session, verify output renders in browser terminal |
| Mobile layout usable on small screen | VIBE-05 | Requires device/browser resize | Open on 375px viewport, verify approval flow, session monitor, node management are usable |
| Cookie-based WS auth works end-to-end | AUTH-05 | Requires live FastAPI server | Login, open browser DevTools, verify no token in WS URL query params |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (all tasks share same test command)
- [x] Wave 0 covers all MISSING references (6 test files listed; none created yet — planned future work)
- [x] No watch-mode flags
- [x] Feedback latency < 30s (build: ~3.4s; test run will be fast when files exist)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-04-10

---

## Nyquist Compliance Note

`nyquist_compliant: true` reflects that the validation strategy is complete: all 10 per-task requirements are mapped to automated commands, all gaps are classified (Wave 0 or Manual-Only), and the sign-off checklist is satisfied. The strategy is compliant even though Wave 0 test files have not been written — those files are the planned test creation work, not a gap in the strategy itself. The build-based verification (pnpm build passes) confirms task 04-01-01. Remaining unit tests require Wave 0 file creation as planned future work.
