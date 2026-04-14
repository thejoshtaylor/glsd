# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.1 — Notifications, Usage, Auth & Polish

**Shipped:** 2026-04-13
**Phases:** 9 (11, 11.1, 12, 13, 14, 15, 16, 17, 18) | **Plans:** 20 | **Commits:** 291
**Timeline:** 2026-04-09 → 2026-04-13 (4 days)

### What Was Built

- Foundation hardened: 8 missing Alembic migrations applied, all Tauri stubs silenced, email send failures surfaced
- Projects/Settings API wired: projects page from real API, user settings persisted server-side, project detail tabs filter by project_id
- Usage tracking: per-session token cost recording on taskComplete, /usage dashboard with node totals and cost chart
- Email auth: password reset via emailed link, email verification on signup with 7-day grace period and unverified banner
- Web Push / PWA: VAPID keys, push_subscription model, service worker, push notifications for permission requests and session completions
- Redis multi-worker: pub/sub fan-out confirmed working; deploy node modal with OS-aware commands and pairing code flow
- Gap closure: 3 added phases (16-18) fixed missing migration, missing VERIFICATION.md, and auth enforcement gap found by audit

### What Worked

- **Inserting Phase 11.1** after Phase 11 completed was clean — decimal phase numbering let us add the API wiring work without renumbering the other 7 phases
- **Audit-first before milestone completion** caught 3 real gaps (missing migration, missing VERIFICATION, auth enforcement hole) that would have shipped as silent bugs
- **pywebpush VAPID auto-generation** on first run was a good pattern — no manual key management step in the deploy flow
- **Gap-closure phase pattern** from v1.0 re-used effectively: phases 16, 17, 18 each had a single clear deliverable and took ≤1 plan each

### What Was Inefficient

- **Phase 11.1 ROADMAP never updated** — all 3 plans completed but progress table showed `0/3 Planning` through milestone end. Should update ROADMAP at SUMMARY write time.
- **Accomplishments in MILESTONES.md had to be hand-corrected** — CLI extracted noise from SUMMARY frontmatter (rule lists, checker output) instead of actual one-liners. SUMMARY files should have a clean `one_liner:` top-level field, not buried in checker output.
- **REQUIREMENTS.md was never recreated** for v1.1 after v1.0 milestone deleted it. Requirements lived only in PROJECT.md Active section, making the audit harder to trace. `/gsd-new-milestone` should always produce a REQUIREMENTS.md.
- **STATE.md stale through milestone** — "Current focus: Phase 13" and "Progress: v1.0 done (1/6 phases shipped)" persisted through Phase 18. Each phase completion should update the Current Position block.

### Patterns Established

- **Decimal phases for inserted work** (11.1) — unambiguous insertion without renumbering; archive with `(INSERTED)` marker
- **VerifiedOrGraceDep on all write endpoints** — pattern from Phase 13; must be applied at endpoint creation time, not retroactively
- **Service worker in `public/` not bundled** — Vite bundles to a hashed filename; SW must be at a stable root path. Always put SW in `public/sw.js`.
- **Separate DB session for side-effect inserts** — UsageRecord and push dispatch use their own sessions so a failure doesn't roll back the primary operation
- **Audit before milestone complete, not mid-milestone** — run audit after all planned phases finish; gap-closure phases resolve it cleanly

### Key Lessons

1. **Update ROADMAP progress table at SUMMARY write time.** A stale progress table (Phase 11.1 showing 0/3) erodes trust in planning artifacts. One-liner update is cheap.
2. **SUMMARY files need a clean `one_liner:` field.** CLI extraction grabbed checker rule output instead of intent. The one-liner should be the first non-frontmatter sentence in the SUMMARY.
3. **Recreate REQUIREMENTS.md at every milestone start.** Having requirements only in PROJECT.md Active made audit traceability harder. REQUIREMENTS.md keeps per-requirement phase/verification links explicit.
4. **Apply auth middleware at the time new endpoints are added.** The VerifiedOrGraceDep gap (POST /nodes/code) was introduced when Phase 15 added the endpoint after Phase 13 established the pattern. Audit caught it; better to apply it immediately.
5. **Push notifications require human E2E verification.** Static code evidence is solid but VAPID key exchange, SW registration, and notification delivery on mobile cannot be machine-verified. Accept `human_needed` and ship — don't block on it.

---

## Milestone: v1.0 — GSD Cloud MVP

**Shipped:** 2026-04-10
**Phases:** 10 | **Plans:** 26 | **Commits:** 152
**Timeline:** 2026-04-09 → 2026-04-10 (2 days)

### What Was Built

- Four-project monorepo with Go workspaces + pnpm workspaces; all builds green from repo root
- Go daemon hardened: RWMutex WAL race fix, pdeathsig orphan prevention, welcome-message WAL replay
- FastAPI relay hub: JWT cookie auth, node pairing, browser/node WebSocket endpoints, PostgreSQL event persistence
- GSD Vibe web app: Tauri fully removed, real-time xterm.js terminal, permission/question prompts, node management dashboard, file browser
- Session resilience: WAL replay on reconnect, SSE activity feed sidebar
- Production deployment: Docker Compose + Redis pub/sub, Nginx reverse proxy, node bash install script with .env config
- 4 gap-closure phases (7-10) completing backend API routes, WebSocket auth wiring, UI connections, and verification closure

### What Worked

- **TDD xfail wave-0** for Phase 3 was high-value: 32 stubs written before implementation forced requirement traceability upfront and made progress visible
- **Phase-first planning before execution** — RESEARCH.md → PLAN.md → execution → SUMMARY.md pipeline kept context tight per plan
- **asyncio.Future pattern** for node relay request/response was elegant; one-shot futures with 5s timeouts prevented hung requests
- **Conditional cookie secure flag** (`ENVIRONMENT != "local"`) was a small fix that unblocked all local WebSocket dev — easy win found in gap audit
- **Inserting gap-closure phases** (7-10) rather than trying to retrofit existing phases kept execution history clean and audit trail clear

### What Was Inefficient

- **Milestone audit ran too early** (2026-04-09) before Phases 5-10 were even planned, producing a misleading `gaps_found` status that required 4 additional phases. Running the audit at the end of planned work would have been less disruptive.
- **STATE.md accumulated stale entries** — "Current Position" block still referenced Phase 6 after Phase 10 completed; the milestone completion sweep should start with STATE.md cleanup, not end with it.
- **ROADMAP.md progress table was never updated** during execution — phases completed without marking the table, so it was stale by Phase 7. Each plan completion should update the progress row.
- **VIBE-02 verification gap** — "all GSD Vibe screens functional" was accepted as complete without a live e2e test, leaving an acknowledged gap in the verified deliverables.

### Patterns Established

- **Gap-closure phases numbered sequentially** (7, 8, 9, 10) after original planned phases — clean insertion without disrupting prior phase numbering
- **VERIFICATION.md + VALIDATION.md as explicit phase artifacts** — not optional, required before milestone closure
- **asyncio.Future for request/response relay** — registered before `send_to_node` call to eliminate the race where node responds before the future is awaited
- **Infrastructure section in navigation.ts** — separates node management from Workspace/System sections in the sidebar nav
- **Build context at repo root for frontend Dockerfile** — pnpm-lock.yaml lives at root, not server/; Dockerfile must be given `..` as build context

### Key Lessons

1. **Run the milestone audit after all planned phases complete, not mid-milestone.** An early audit creates noise and requires reactive phases that could have been planned upfront.
2. **Keep ROADMAP.md progress table updated during execution.** Stale progress rows erode confidence in planning artifacts; one-line update per plan completion is cheap.
3. **"human_needed" verification is still verification.** Static code evidence for a relay chain is sufficient to mark requirements complete — note the e2e gap, don't block the milestone on it.
4. **Conditional flags for environment differences** (secure cookie, Redis fallback, CORS) are more maintainable than separate config files. One flag, two paths.
5. **Accumulate STATE.md decisions as they happen, not during retrospective.** By milestone end, the decisions list had 25+ entries that needed to be distilled — better to keep them pruned weekly.

### Cost Observations

- Model mix: primarily Sonnet 4.6 throughout
- Sessions: ~20 sessions across 2 days
- Notable: Phase 4 P01 took ~180 min (Tauri removal + API client + cookie auth was the most complex single plan); most plans ran 2-15 min. Gap-closure phases (7-9) were fast (5-15 min) because the audit had already scoped them precisely.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 10 | 26 | First milestone; established RESEARCH→PLAN→SUMMARY pipeline |

### Cumulative Quality

| Milestone | Tests | Stack | Notes |
|-----------|-------|-------|-------|
| v1.0 | 119 pytest | FastAPI + Go + React | All passing against live PostgreSQL |

### Top Lessons (Verified Across Milestones)

1. Run milestone audit after all planned phases complete, not during execution
2. Keep ROADMAP.md progress table updated in real time during execution
