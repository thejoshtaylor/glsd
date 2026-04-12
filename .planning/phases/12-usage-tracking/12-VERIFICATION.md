---
phase: 12-usage-tracking
verified: 2026-04-12T08:00:00Z
status: gaps_found
score: 2/3 must-haves verified
overrides_applied: 0
gaps:
  - truth: "User can view per-session token usage and cost breakdown on the session detail view"
    status: failed
    reason: "No dedicated session detail view exists that surfaces per-session cost. node-session-page.tsx is a terminal launcher with no cost display. session-redirect.tsx is a thin redirect — per its own comment 'not a real session detail page'. The activity feed sidebar shows cost on taskComplete events (which partially satisfies the intent) but the roadmap SC specifically names 'the session detail view' as the surface."
    artifacts:
      - path: "server/frontend/src/components/nodes/node-session-page.tsx"
        issue: "100-line terminal launcher; no cost/token fields rendered"
      - path: "server/frontend/src/pages/session-redirect.tsx"
        issue: "Thin redirect only; explicitly not a session detail page per its comment"
    missing:
      - "A session detail view (or enriched node-session-page) that displays input_tokens, output_tokens, cost_usd, duration_ms from the completed session's UsageRecord"
---

# Phase 12: Usage Tracking Verification Report

**Phase Goal:** Users can see how much each Claude Code session costs and track spending across nodes
**Verified:** 2026-04-12T08:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | When a session completes (taskComplete event), the server writes inputTokens, outputTokens, costUsd, and durationMs into the usage_record table | VERIFIED | `ws_node.py` lines 258–332: cost parsed before broadcast, UsageRecord inserted in separate DBSession block after session status update. `UsageRecord` model at `models.py:290–302` has all required fields. 22 backend tests including `test_usage_record_creation`. |
| 2 | User can view per-session token usage and cost breakdown on the session detail view | FAILED | No dedicated session detail view exists. `node-session-page.tsx` is a terminal launcher (100 lines, no cost fields). `session-redirect.tsx` is a thin redirect explicitly noted "not a real session detail page". Activity feed sidebar (`activity-event-item.tsx`) shows cost on taskComplete events but is not a session detail view. |
| 3 | User can navigate to /usage and see a usage history dashboard with per-node totals and a cost chart | VERIFIED | `App.tsx:78` registers `/usage` route. `usage.tsx` renders `UsageSummaryCards`, `UsageNodeBreakdown` (progress bars), `UsageDailyChart` (recharts BarChart), and `UsageSessionTable`. Both `useQuery` hooks call real API endpoints via `getUsageSummary` and `getUsageList`. Navigation entry added in `navigation.ts:46`. |

**Score:** 2/3 truths verified

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `server/backend/app/models.py` — UsageRecord | VERIFIED | Lines 290–302: all fields present (id, session_id, user_id, input_tokens, output_tokens, cost_usd, duration_ms, created_at) |
| `server/backend/app/api/routes/ws_node.py` — UsageRecord insert | VERIFIED | Lines 300–332: separate DBSession, cost parsed via try/except, insert wrapped in outer try/except, logger.warning on failure |
| `server/backend/app/api/routes/usage.py` | VERIFIED | `list_usage` and `get_usage_summary` endpoints; user filter on both; period validation via regex; `func.sum(UsageRecord.cost_usd)` in summary |
| `server/backend/app/api/main.py` | VERIFIED | Line 3: `usage` imported; line 15: `api_router.include_router(usage.router)` |
| `server/backend/tests/api/test_usage.py` | VERIFIED | 22 test functions; covers formatting helpers, model creation, REST endpoints, user isolation, auth enforcement, activity enrichment |
| `server/frontend/src/lib/format.ts` | VERIFIED | `formatCost`, `formatDuration`, `formatTokenCount` — matches D-15/D-16 spec |
| `server/frontend/src/lib/api/usage.ts` | VERIFIED | Full TypeScript interfaces; `getUsageList` and `getUsageSummary` fetch functions |
| `server/frontend/src/pages/usage.tsx` | VERIFIED | Period selector, two useQuery hooks, all four child components rendered with real data from API |
| `server/frontend/src/components/usage/usage-summary-cards.tsx` | VERIFIED | 3-card grid; Total Cost, Total Sessions, Avg Cost/Session; `formatCost` applied |
| `server/frontend/src/components/usage/usage-node-breakdown.tsx` | VERIFIED | Progress bars, sorted by cost descending, `formatCost` applied |
| `server/frontend/src/components/usage/usage-daily-chart.tsx` | VERIFIED | recharts BarChart in ResponsiveContainer; `cost_usd` dataKey; real data from API |
| `server/frontend/src/components/usage/usage-session-table.tsx` | VERIFIED | 6-column table; Prev/Next pagination; `formatCost`, `formatDuration`, `formatTokenCount` applied |
| `server/frontend/src/components/activity/activity-event-item.tsx` | VERIFIED | `getTaskCompleteDetail()` extracts cost from both SSE (top-level) and REST (payload) sources |
| `server/frontend/src/hooks/use-activity-feed.ts` | VERIFIED | `ActivityEvent` interface extended with optional `input_tokens`, `output_tokens`, `cost_usd`, `duration_ms` fields |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `ws_node.py` taskComplete block | `UsageRecord` model | DBSession insert (lines 316–326) | WIRED | Separate session from status update per T-12-04 |
| `usage.py` list_usage | `UsageRecord` model | `select(...).where(UsageRecord.user_id == current_user.id)` | WIRED | User filter present; join to Node for node_name |
| `usage.py` get_usage_summary | `UsageRecord` model | `func.sum(UsageRecord.cost_usd)` with user filter | WIRED | All three aggregate queries filter by user_id |
| `main.py` | `usage.router` | `api_router.include_router(usage.router)` line 15 | WIRED | Router registered |
| `activity.py` get_activity | `UsageRecord` model | Batch query by session_id; merge into taskComplete items | WIRED | Lines 46–75; cost fields added to matching events |
| `usage.tsx` | `GET /usage/`, `GET /usage/summary` | `useQuery` + `getUsageList`/`getUsageSummary` | WIRED | Both queries return real data; components receive non-empty props |
| `activity-event-item.tsx` | cost fields | `getTaskCompleteDetail()` + `formatCost` | WIRED | Extracts from both SSE top-level and REST payload sub-object |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `usage-summary-cards.tsx` | `totalCost`, `totalSessions` | `summaryQuery.data` from `getUsageSummary` → `GET /usage/summary` → SQLAlchemy `func.sum` queries | Yes — DB aggregates | FLOWING |
| `usage-node-breakdown.tsx` | `nodes` | `summaryQuery.data?.by_node` → same endpoint | Yes — group by Node.id | FLOWING |
| `usage-daily-chart.tsx` | `data` | `summaryQuery.data?.daily` → `func.date()` group by | Yes — daily cost aggregates | FLOWING |
| `usage-session-table.tsx` | `data`, `total`, `totalPages` | `listQuery.data` from `getUsageList` → paginated UsageRecord query | Yes — DB rows with node_name join | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED — requires running server (PostgreSQL + FastAPI). Tests confirmed to exist for all major behaviors; 22 test functions in `test_usage.py`.

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| COST-01 | Write UsageRecord on taskComplete events | SATISFIED | `ws_node.py` lines 300–332; UsageRecord model in models.py |
| COST-02 | Usage REST endpoints serving paginated records and aggregates | SATISFIED | `GET /usage/` and `GET /usage/summary` with auth, period filter, user isolation |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `ws_node.py` | 312–314 | `manager.get_node(machine_id)` called a second time to retrieve `user_id` — race condition if node disconnects concurrently causes silent UsageRecord skip | High (from code review H-01) | UsageRecord silently not written on concurrent disconnect; no error logged |
| `usage-daily-chart.tsx` | 18 | `new Date(d)` on bare date string treats as UTC midnight — wrong day in UTC− timezones | Medium (from code review M-01) | Daily chart labels off by one day for users west of UTC |
| `activity.py` | 51–57 | UsageRecord batch query not scoped to `current_user.id` | Medium (from code review M-02) | Defense-in-depth gap; no actual leak given upstream filter but inconsistent ownership enforcement |

The race condition in `ws_node.py` (H-01) is a reliability issue rather than a correctness blocker for the verification — the UsageRecord insert path is present and functional for the non-race case. The other two are display/security hygiene issues.

### Human Verification Required

#### 1. Session Detail Cost Display

**Test:** Complete a Claude Code session on a connected node, then navigate to that session.
**Expected:** Per the roadmap SC, per-session token usage and cost breakdown should be visible on the session detail view.
**Why human:** No programmatic session detail view exists to test against. The activity feed sidebar shows cost on taskComplete events in `activity-event-item.tsx`, but whether this satisfies the intent of "session detail view" requires product judgment.

#### 2. End-to-end UsageRecord write on real taskComplete

**Test:** Run a real Claude Code session to completion, then query `GET /api/v1/usage/` and verify a row appears.
**Expected:** UsageRecord row present with correct input_tokens, output_tokens, cost_usd, duration_ms.
**Why human:** Requires live PostgreSQL + daemon + FastAPI stack; cannot verify with static analysis.

### Gaps Summary

One truth fails against the roadmap contract: **SC #2 — "User can view per-session token usage and cost breakdown on the session detail view."**

No session detail view exists in the codebase. The `node-session-page.tsx` is a terminal launcher only; `session-redirect.tsx` is a thin redirect. The activity feed (`activity-event-item.tsx`) does show cost on taskComplete events, which partially covers the intent, but it is a sidebar feed rather than a session detail view.

SC #1 (UsageRecord write on taskComplete) and SC #3 (/usage dashboard with per-node totals and cost chart) are fully implemented and wired with real data.

---

_Verified: 2026-04-12T08:00:00Z_
_Verifier: Claude (gsd-verifier)_
