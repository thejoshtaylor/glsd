# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

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
