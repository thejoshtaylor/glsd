# Milestones

## v1.1 Notifications, Usage, Auth & Polish (Shipped: 2026-04-13)

**Phases completed:** 9 phases (11, 11.1, 12, 13, 14, 15, 16, 17, 18), 20 plans
**Timeline:** 2026-04-09 → 2026-04-13 (4 days)
**Commits:** 291
**Files changed:** 274 (+28,357 / -6,354)

**Key accomplishments:**

- Foundation hardened: 8 missing v1.0 Alembic migrations applied, all Tauri stub errors silenced with real API wiring, email send failures surfaced to users
- Projects and settings wired: Projects page loads from real API with slim cards; user settings persist server-side via user_settings table; project detail tabs (activity/sessions/usage) filter by project_id
- Usage tracking: Per-session token costs captured on taskComplete, /usage dashboard with per-node totals and cost chart, session detail cost display
- Email auth flows: Password reset via emailed link (/forgot-password → /reset-password), email verification on signup with 7-day grace period, unverified banner, existing v1.0 users auto-verified
- Web Push notifications (PWA): VAPID keys, push_subscription model, service worker, push notifications for permission requests and session completions, installable as PWA on mobile
- Redis multi-worker relay: Pub/sub fan-out scales to multi-worker deployments; deploy node modal with OS-aware install commands, copy buttons, pairing code, and live connection indicator
- Auth hardening: VerifiedOrGraceDep applied to all write endpoints including pairing code generation; Phase 13 formally verified (AUTH-07/AUTH-08 SATISFIED); Phase 16 migration confirmed

**Requirements delivered:** 7/7 v1.1 requirements complete (NOTF-01, NOTF-02, COST-01, COST-02, AUTH-07, AUTH-08, SCAL-01)
**Archive:** [.planning/milestones/v1.1-ROADMAP.md](.planning/milestones/v1.1-ROADMAP.md)

---

## v1.0 GSD Cloud MVP (Shipped: 2026-04-10)

**Phases completed:** 10 phases, 26 plans, 37 tasks
**Timeline:** 2026-04-09 → 2026-04-10 (2 days)
**Commits:** 152

**Key accomplishments:**

- Four-project monorepo established with go.work + pnpm workspaces; all build pipelines green (Go, pnpm, Docker Compose)
- Go daemon made production-reliable: RWMutex WAL race fix, pdeathsig Linux orphan prevention, welcome-message WAL replay with ack-driven pruning
- FastAPI relay hub implemented: JWT auth, node pairing with argon2 tokens, browser/node WebSocket relay, PostgreSQL session/event persistence
- GSD Vibe web app: Tauri IPC fully removed, real-time xterm.js terminal streaming, permission/question prompts, node management dashboard, file browser via REST relay
- Session resilience: WAL replay on browser reconnect (lastSeq dedup), SSE activity feed, collapsible activity sidebar with badge count
- Production deployment stack: Docker Compose with Redis pub/sub for multi-worker relay, Nginx reverse proxy with SPA fallback, node bash install script with .env config
- Backend API gap closure: GET /nodes/{node_id} endpoint, node_id session filter, channel_id on SessionPublic, xfail stub conversion to real tests
- WebSocket auth wiring: conditional cookie secure flag (local HTTP dev works), cwd threaded from createSession to sendTask, session page at /nodes/:nodeId/session
- UI wiring complete: ReconnectionBanner connected to InteractiveTerminal, /sessions/:id redirect route, first-launch-wizard Tauri stub removed
- Verification closure: VERIFICATION.md for phases 4 and 5, Nyquist compliance for phases 2/3/4, 119/119 pytest passing against live PostgreSQL

**Requirements delivered:** 31/31 v1 requirements complete
**Archive:** [.planning/milestones/v1.0-ROADMAP.md](.planning/milestones/v1.0-ROADMAP.md)

---
