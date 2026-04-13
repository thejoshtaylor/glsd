# Roadmap: GSD Cloud

## Milestones

- ✅ **v1.0 GSD Cloud MVP** — Phases 1-10 (shipped 2026-04-10) — [archive](.planning/milestones/v1.0-ROADMAP.md)
- 🚧 **v1.1 Notifications, Usage, Auth & Polish** — Phases 11-15 (in progress)

## Phases

<details>
<summary>v1.0 GSD Cloud MVP (Phases 1-10) — SHIPPED 2026-04-10</summary>

- [x] Phase 1: Monorepo Foundation (2/2 plans) — completed 2026-04-09
- [x] Phase 2: Daemon Stabilization (2/2 plans) — completed 2026-04-10
- [x] Phase 3: Server Relay and Auth (5/5 plans) — completed 2026-04-10
- [x] Phase 4: Frontend Integration (5/5 plans) — completed 2026-04-10
- [x] Phase 5: Reliability and Persistence (3/3 plans) — completed 2026-04-10
- [x] Phase 6: Deployment Polish (3/3 plans) — completed 2026-04-10
- [x] Phase 7: Backend API Completion (1/1 plans) — completed 2026-04-10
- [x] Phase 8: WebSocket Auth and Session Wiring (1/1 plans) — completed 2026-04-10
- [x] Phase 9: UI Wiring Completion (1/1 plans) — completed 2026-04-10
- [x] Phase 10: Phase Verification Closure (3/3 plans) — completed 2026-04-10

Full phase details: [.planning/milestones/v1.0-ROADMAP.md](.planning/milestones/v1.0-ROADMAP.md)

</details>

### v1.1 Notifications, Usage, Auth & Polish (In Progress)

**Milestone Goal:** Add push notifications, token usage tracking, email auth flows, and a fully polished UI -- fixing all remaining migration gaps, Tauri stubs, and deployment UX.

- [x] **Phase 11: Foundation -- Migrations and Stub Cleanup** - Fix broken pages, create new tables/columns, replace Tauri stubs, harden email sends (completed 2026-04-11)
- [x] **Phase 12: Usage Tracking** - Record per-session token costs and surface usage history in the UI (completed 2026-04-12)
- [ ] **Phase 13: Email Auth Flows** - Password reset via email link and email verification on signup
- [ ] **Phase 14: Web Push Notifications** - Push notifications for permission requests and session completions
- [ ] **Phase 15: Redis Multi-Worker and Deploy Modal** - Verified multi-worker relay via Redis pub/sub and node deployment UX

## Phase Details

### Phase 11: Foundation -- Migrations and Stub Cleanup
**Goal**: The application is stable on a v1.0 database -- all pages load without errors, all frontend features work without Tauri stubs, and email failures are surfaced to users
**Depends on**: Phase 10 (v1.0 complete)
**Requirements**: FIX-01, FIX-02, FIX-03
**Success Criteria** (what must be TRUE):
  1. Nodes page and Projects page load without 500 errors on a database upgraded from v1.0 (node.token_hash and all other missing columns present)
  2. No "not available" or Tauri-related error messages appear anywhere in the frontend during normal use
  3. When SMTP is misconfigured or an email send fails, the user sees an error message (not silent success)
  4. New database tables (push_subscription, usage_record) and new User columns (email_verified, email_verification_token, email_verification_sent_at) exist after migration, with safe defaults for existing rows
**Plans:** 3/3 plans complete
Plans:
- [x] 11-01-PLAN.md -- Database migrations: model audit, new tables/columns, migration tests
- [x] 11-02-PLAN.md -- Tauri stub replacement: silence warnings, wire to APIs, update components
- [x] 11-03-PLAN.md -- Email error handling: harden send_email, wrap callers, add tests

### Phase 11.1: Cloud API Endpoints and Full Stub Wiring (INSERTED)

**Goal:** [Urgent work - to be planned]
**Requirements**: TBD
**Depends on:** Phase 11
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 11.1 to break down)

### Phase 12: Usage Tracking
**Goal**: Users can see how much each Claude Code session costs and track spending across nodes
**Depends on**: Phase 11 (usage_record table exists)
**Requirements**: COST-01, COST-02
**Success Criteria** (what must be TRUE):
  1. When a session completes (taskComplete event), the server writes inputTokens, outputTokens, costUsd, and durationMs into the usage_record table
  2. User can view per-session token usage and cost breakdown on the session detail view
  3. User can navigate to /usage and see a usage history dashboard with per-node totals and a cost chart
**Plans:** 3/2 plans complete
Plans:
- [x] 12-01-PLAN.md -- Backend: UsageRecord capture on taskComplete, usage REST API endpoints, activity feed enrichment
- [x] 12-02-PLAN.md -- Frontend: Usage dashboard page (/usage), shared format utilities, activity feed cost display
- [x] 12-03-PLAN.md -- Gap closure: session detail page, per-session usage endpoint, bug fixes (H-01, M-01, M-02)

### Phase 13: Email Auth Flows
**Goal**: Users can recover locked accounts via password reset and new signups are verified via email
**Depends on**: Phase 11 (User email columns exist, email error handling hardened)
**Requirements**: AUTH-07, AUTH-08
**Success Criteria** (what must be TRUE):
  1. User can request a password reset email from /forgot-password and set a new password via the emailed link at /reset-password
  2. New users receive an email verification link on signup; clicking it marks the account as verified
  3. Unverified users see a banner prompting verification; after 7 days unverified accounts enter read-only mode
  4. Existing v1.0 users are not affected by the email verification migration (they are treated as already verified)
**Plans:** 2 plans
Plans:
- [ ] 13-01-PLAN.md -- Backend: migration, model columns, verification endpoints, email template, signup modification, read-only enforcement
- [ ] 13-02-PLAN.md -- Frontend: forgot-password, reset-password, verify-email pages, verification banner, auth context extension

### Phase 14: Web Push Notifications
**Goal**: Users receive push notifications on their device when Claude needs approval or a session finishes, so they can walk away from active sessions
**Depends on**: Phase 11 (push_subscription table exists), Phase 12 (ws_node.py integration pattern validated)
**Requirements**: NOTF-01, NOTF-02
**Success Criteria** (what must be TRUE):
  1. User can enable push notifications from a settings toggle and grant browser notification permission
  2. When a permission request arrives on any active session, the user receives a push notification on their device (even if the browser tab is backgrounded)
  3. When a session completes (taskComplete), the user receives a push notification
  4. Push notifications work as a PWA on mobile (installable, notifications delivered when app is not in foreground)
**Plans**: TBD
**UI hint**: yes

### Phase 15: Redis Multi-Worker and Deploy Modal
**Goal**: The server relay works correctly under multi-worker deployment, and new users can pair nodes with clear step-by-step instructions
**Depends on**: Phase 14 (all features working in single-worker mode)
**Requirements**: SCAL-01, UX-01
**Success Criteria** (what must be TRUE):
  1. When the target browser WebSocket connection is on a different Uvicorn worker, messages are delivered via Redis pub/sub fallback
  2. The Redis subscriber loop retries automatically on disconnect without silent failure
  3. A docker-compose.multiworker.yml override is provided for multi-worker deployment
  4. User can open a "Deploy on new node" modal from the Nodes page showing OS-aware install commands with copy buttons and a live connection indicator
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 11 -> 12 -> 13 -> 14 -> 15

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Monorepo Foundation | v1.0 | 2/2 | Complete | 2026-04-09 |
| 2. Daemon Stabilization | v1.0 | 2/2 | Complete | 2026-04-10 |
| 3. Server Relay and Auth | v1.0 | 5/5 | Complete | 2026-04-10 |
| 4. Frontend Integration | v1.0 | 5/5 | Complete | 2026-04-10 |
| 5. Reliability and Persistence | v1.0 | 3/3 | Complete | 2026-04-10 |
| 6. Deployment Polish | v1.0 | 3/3 | Complete | 2026-04-10 |
| 7. Backend API Completion | v1.0 | 1/1 | Complete | 2026-04-10 |
| 8. WebSocket Auth and Session Wiring | v1.0 | 1/1 | Complete | 2026-04-10 |
| 9. UI Wiring Completion | v1.0 | 1/1 | Complete | 2026-04-10 |
| 10. Phase Verification Closure | v1.0 | 3/3 | Complete | 2026-04-10 |
| 11. Foundation -- Migrations and Stub Cleanup | v1.1 | 3/3 | Complete   | 2026-04-11 |
| 12. Usage Tracking | v1.1 | 3/2 | Complete    | 2026-04-12 |
| 13. Email Auth Flows | v1.1 | 0/2 | Planned | - |
| 14. Web Push Notifications | v1.1 | 0/0 | Not started | - |
| 15. Redis Multi-Worker and Deploy Modal | v1.1 | 0/0 | Not started | - |
