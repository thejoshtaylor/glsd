---
phase: 12-usage-tracking
verified: 2026-04-12T12:30:00Z
status: human_needed
score: 3/3 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 2/3
  gaps_closed:
    - "User can view per-session token usage and cost breakdown on the session detail view"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Complete a Claude Code session on a connected node, then navigate to /sessions/:id for that session."
    expected: "Completed session shows a Cost Breakdown card with input token count, output token count, cost, and duration. Active/running sessions redirect to the terminal launcher at /nodes/:nodeId/session."
    why_human: "Requires live PostgreSQL + daemon + FastAPI + frontend stack. Static analysis confirms the page renders cost fields from usage data — runtime behavior with a real session must be manually confirmed."
  - test: "Run a real Claude Code session to completion, then call GET /api/v1/usage/ and GET /api/v1/usage/session/{session_id}."
    expected: "UsageRecord row appears with correct input_tokens, output_tokens, cost_usd, duration_ms values matching what the daemon reported."
    why_human: "Requires a live node daemon emitting taskComplete events with cost fields. Unit tests cover the insert logic; end-to-end flow requires a running stack."
---

# Phase 12: Usage Tracking Verification Report

**Phase Goal:** Users can see how much each Claude Code session costs and track spending across nodes
**Verified:** 2026-04-12T12:30:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (Plan 12-03)

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | When a session completes (taskComplete event), the server writes inputTokens, outputTokens, costUsd, and durationMs into the usage_record table | VERIFIED | `ws_node.py` lines 258–332: `parsed_cost` captured before broadcast, `UsageRecord` inserted in separate `DBSession` block (line 309–330). H-01 race condition fixed: line 313 uses `uuid.UUID(user_id)` (pre-captured local variable from line 136) not `manager.get_node()`. `UsageRecord` model at `models.py:290–302` has all required fields. 27 backend tests including `test_usage_record_creation`. |
| 2 | User can view per-session token usage and cost breakdown on the session detail view | VERIFIED | `session-redirect.tsx` exports `SessionDetailPage` (line 20). Completed sessions fetch `getSessionUsage(id)` via `useQuery` (line 32–37). Renders `usage.input_tokens` via `formatTokenCount`, `usage.output_tokens` via `formatTokenCount`, `usage.cost_usd` via `formatCost`, and `usage.duration_ms` via `formatDuration` in a Cost Breakdown card (lines 128–179). Active sessions redirect to terminal via `<Navigate>` (line 65). App.tsx routes `/sessions/:id` to `SessionDetailPage` (line 79). Backend endpoint `GET /api/v1/usage/session/{session_id}` in `usage.py` lines 169–192 enforces user ownership. |
| 3 | User can navigate to /usage and see a usage history dashboard with per-node totals and a cost chart | VERIFIED | `App.tsx:78` registers `/usage` route to `UsagePage`. `usage.tsx` renders `UsageSummaryCards`, `UsageNodeBreakdown` (progress bars sorted by cost), `UsageDailyChart` (recharts BarChart with timezone-correct labels), and `UsageSessionTable` (paginated). Both `useQuery` hooks call real API endpoints via `getUsageSummary` and `getUsageList`. Navigation entry added in `navigation.ts`. |

**Score:** 3/3 truths verified

### Re-verification: Gap Closure

The single gap from the initial verification (2026-04-12T08:00:00Z) was:

**Gap:** "User can view per-session token usage and cost breakdown on the session detail view"

**Closed by Plan 12-03 (commits b10e0d3, ddf3906, 1cf9d5a):**

- `session-redirect.tsx` replaced: thin redirect → full `SessionDetailPage` with cost breakdown card for completed sessions and terminal redirect for active sessions (183 lines)
- `usage.ts` extended: `SessionUsageRecord` interface and `getSessionUsage` fetch function added
- `usage.py` extended: `GET /session/{session_id}` endpoint with user ownership enforcement (404 for other users)
- `App.tsx` updated: imports and routes `SessionDetailPage` instead of `SessionRedirectPage`

**Bug fixes also applied in 12-03:**
- H-01 (ws_node.py): UsageRecord insert now uses pre-captured `user_id` variable, eliminating race condition on node disconnect
- M-01 (usage-daily-chart.tsx): Bare date strings parsed with `T00:00:00` suffix to prevent off-by-one day labels in negative UTC offset timezones
- M-02 (activity.py): UsageRecord batch query now includes `UsageRecord.user_id == current_user.id` filter for defense-in-depth

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `server/backend/app/models.py` — UsageRecord | VERIFIED | Lines 290–302: all fields present (id, session_id, user_id, input_tokens, output_tokens, cost_usd, duration_ms, created_at) |
| `server/backend/app/api/routes/ws_node.py` — UsageRecord insert | VERIFIED | Lines 309–330: separate DBSession, `uuid.UUID(user_id)` (H-01 fixed), outer try/except with logger.warning |
| `server/backend/app/api/routes/usage.py` | VERIFIED | `list_usage`, `get_usage_summary`, `get_session_usage` endpoints; user filter on all; period validation via regex; `func.sum(UsageRecord.cost_usd)` in summary |
| `server/backend/app/api/main.py` | VERIFIED | `usage` imported; `api_router.include_router(usage.router)` present |
| `server/backend/tests/api/test_usage.py` | VERIFIED | 27 test functions: formatting helpers, model creation, REST endpoints, user isolation, auth enforcement, activity enrichment, session usage endpoint (5 new tests) |
| `server/frontend/src/lib/format.ts` | VERIFIED | `formatCost`, `formatDuration`, `formatTokenCount` present |
| `server/frontend/src/lib/api/usage.ts` | VERIFIED | Full TypeScript interfaces; `getUsageList`, `getUsageSummary`, `getSessionUsage` fetch functions; `SessionUsageRecord` interface |
| `server/frontend/src/pages/usage.tsx` | VERIFIED | Period selector, two useQuery hooks, all four child components rendered |
| `server/frontend/src/pages/session-redirect.tsx` | VERIFIED | Exports `SessionDetailPage`; renders cost breakdown for completed sessions; redirects active sessions; 183 lines |
| `server/frontend/src/components/usage/usage-summary-cards.tsx` | VERIFIED | 3-card grid; Total Cost, Total Sessions, Avg Cost/Session |
| `server/frontend/src/components/usage/usage-node-breakdown.tsx` | VERIFIED | Progress bars sorted by cost descending |
| `server/frontend/src/components/usage/usage-daily-chart.tsx` | VERIFIED | M-01 fixed: `T00:00:00` suffix on bare date strings (line 19); recharts BarChart with real data |
| `server/frontend/src/components/usage/usage-session-table.tsx` | VERIFIED | 6-column table; Prev/Next pagination |
| `server/frontend/src/components/activity/activity-event-item.tsx` | VERIFIED | `getTaskCompleteDetail()` extracts cost from both SSE top-level and REST payload |
| `server/frontend/src/hooks/use-activity-feed.ts` | VERIFIED | `ActivityEvent` interface extended with optional cost fields |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `ws_node.py` taskComplete block | UsageRecord model | Separate DBSession insert (lines 309–330); `uuid.UUID(user_id)` local var | WIRED | H-01 fixed: no re-query of ConnectionManager |
| `usage.py` list_usage | UsageRecord model | `select(...).where(UsageRecord.user_id == current_user.id)` | WIRED | User filter present; join to Node for node_name |
| `usage.py` get_usage_summary | UsageRecord model | `func.sum(UsageRecord.cost_usd)` with user filter | WIRED | All three aggregate queries filter by user_id |
| `usage.py` get_session_usage | UsageRecord model | `select(UsageRecord).where(session_id, user_id)` | WIRED | Ownership enforced; 404 for other users |
| `main.py` | usage.router | `api_router.include_router(usage.router)` | WIRED | Router registered |
| `activity.py` get_activity | UsageRecord model | Batch query by session_id with `UsageRecord.user_id == current_user.id` (M-02 fixed) | WIRED | Lines 51–56; defense-in-depth filter added |
| `session-redirect.tsx` | GET /api/v1/usage/session/{id} | `useQuery` + `getSessionUsage` (enabled only when `isCompleted`) | WIRED | Renders result in Cost Breakdown card |
| `usage.tsx` | GET /usage/, GET /usage/summary | `useQuery` + `getUsageList`/`getUsageSummary` | WIRED | Both queries fetch real data; components receive non-empty props |
| `App.tsx` /sessions/:id route | SessionDetailPage | Lazy import `session-redirect.tsx` as `SessionDetailPage` | WIRED | Line 35 lazy import; line 79 route |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `session-redirect.tsx` | `usage` | `useQuery(getSessionUsage)` → `GET /usage/session/{id}` → `select(UsageRecord).where(session_id, user_id)` → DB row | Yes — DB row with real token/cost fields | FLOWING |
| `usage-summary-cards.tsx` | `totalCost`, `totalSessions` | `getUsageSummary` → `GET /usage/summary` → SQLAlchemy `func.sum` queries | Yes — DB aggregates | FLOWING |
| `usage-node-breakdown.tsx` | `nodes` | `summaryQuery.data?.by_node` → group by Node.id | Yes — per-node aggregates | FLOWING |
| `usage-daily-chart.tsx` | `data` | `summaryQuery.data?.daily` → `func.date()` group by | Yes — daily cost aggregates; M-01 timezone fix applied | FLOWING |
| `usage-session-table.tsx` | `data`, `total`, `totalPages` | `getUsageList` → paginated UsageRecord query with node_name join | Yes — DB rows | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED — requires running server (PostgreSQL + FastAPI + frontend). Frontend TypeScript compilation and Vite build both confirmed passing per Plan 12-03 SUMMARY (exit 0 for both). 27 backend tests exist and passed in 12-03 execution.

### Requirements Coverage

| Requirement | Source | Description | Status | Evidence |
|-------------|--------|-------------|--------|----------|
| COST-01 | Plans 12-01, 12-03 | Server tracks per-session token usage from daemon usage events | SATISFIED | `ws_node.py` lines 258–330: UsageRecord written on every taskComplete event. H-01 fixed: no race condition on node disconnect. 22+ backend tests cover this path. |
| COST-02 | Plans 12-01, 12-02, 12-03 | User can view usage history per node and per session | SATISFIED | /usage dashboard (SC #3) — per-node progress bars, daily chart, paginated session table. /sessions/:id detail page (SC #2) — per-session cost breakdown. Both surfaces serve real data from DB queries. |

### Anti-Patterns Found

No new anti-patterns introduced in Plan 12-03. Previously identified issues resolved:

| Issue | File | Fix | Status |
|-------|------|-----|--------|
| H-01: race condition re-querying ConnectionManager | ws_node.py line 313 | Uses `uuid.UUID(user_id)` (pre-captured local var from line 136) | FIXED |
| M-01: bare date string parsed as UTC midnight | usage-daily-chart.tsx line 18-19 | `T00:00:00` suffix appended before parsing | FIXED |
| M-02: UsageRecord batch query missing user_id filter | activity.py line 54 | `UsageRecord.user_id == current_user.id` added to WHERE clause | FIXED |

### Human Verification Required

#### 1. Session Detail Cost Display (End-to-End)

**Test:** Complete a Claude Code session on a connected node, then navigate to `/sessions/:id` for that session.
**Expected:** Completed session shows a Cost Breakdown card with formatted input token count, output token count, cost (e.g., "$0.04"), and duration (e.g., "42s"). Active/running sessions at `/sessions/:id` redirect to the terminal launcher at `/nodes/:nodeId/session`.
**Why human:** Requires live PostgreSQL + daemon + FastAPI + frontend stack. Static analysis confirms the page renders cost fields from usage data; runtime behavior with a real session must be manually confirmed.

#### 2. End-to-end UsageRecord Write on Real taskComplete

**Test:** Run a real Claude Code session to completion, then call `GET /api/v1/usage/` and `GET /api/v1/usage/session/{session_id}`.
**Expected:** UsageRecord row appears with correct `input_tokens`, `output_tokens`, `cost_usd`, `duration_ms` values matching what the daemon reported.
**Why human:** Requires a live node daemon emitting taskComplete events with cost fields. Unit tests cover the insert logic; end-to-end flow requires a running stack.

### Gaps Summary

No gaps remain. The single gap from the initial verification (SC #2 — session detail view) was closed by Plan 12-03. All three roadmap success criteria are verified against the actual codebase.

---

_Verified: 2026-04-12T12:30:00Z_
_Verifier: Claude (gsd-verifier)_
