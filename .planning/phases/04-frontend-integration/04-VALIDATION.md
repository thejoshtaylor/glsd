---
phase: 4
slug: frontend-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-09
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
| 04-01-01 | 01 | 1 | VIBE-01 | — | No Tauri imports compile | build | `cd server/frontend && pnpm build` | ❌ W0 | ⬜ pending |
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

---

## Wave 0 Requirements

- [ ] `server/frontend/src/__tests__/api-client.test.ts` — stubs for VIBE-01 (no Tauri, lib/api exports)
- [ ] `server/frontend/src/__tests__/auth.test.tsx` — stubs for AUTH-05, AUTH-06 (login form, ProtectedRoute)
- [ ] `server/frontend/src/__tests__/session.test.tsx` — stubs for SESS-03, SESS-04 (useCloudSession hook)
- [ ] `server/frontend/src/__tests__/nodes.test.tsx` — stubs for VIBE-02, VIBE-03 (node list, revoke)
- [ ] `server/frontend/src/__tests__/filesystem.test.tsx` — stubs for VIBE-04 (file browser)
- [ ] `server/frontend/src/__tests__/permissions.test.tsx` — stubs for VIBE-05 (permission request)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| xterm.js terminal renders Claude Code output live | SESS-03 | WebSocket stream requires live server/node | Connect a real node, start a session, verify output renders in browser terminal |
| Mobile layout usable on small screen | VIBE-05 | Requires device/browser resize | Open on 375px viewport, verify approval flow, session monitor, node management are usable |
| Cookie-based WS auth works end-to-end | AUTH-05 | Requires live FastAPI server | Login, open browser DevTools, verify no token in WS URL query params |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
