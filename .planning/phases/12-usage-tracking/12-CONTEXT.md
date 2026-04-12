# Phase 12: Usage Tracking - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Record token costs and duration into `usage_record` when `taskComplete` fires, then surface usage data at two levels: (1) per-session cost in the activity feed, and (2) a `/usage` dashboard with a daily cost chart, node totals, and paginated session list.

**This phase does NOT implement:** budget alerts, per-turn usage breakdown, push notifications for cost thresholds, or Redis multi-worker (all future phases).

</domain>

<decisions>
## Implementation Decisions

### Backend — Data Capture (COST-01)

- **D-01:** Write `UsageRecord` in the `taskComplete` handler in `ws_node.py` (line ~253), immediately after the existing `crud.update_session_status` call. Same DB session pattern as the surrounding code.
- **D-02:** `cost_usd` arrives as a string from the protocol (e.g., `"0.0123"`). Parse to `float` with a try/except; on parse failure default to `0.0` and log a warning. Do not crash the handler.
- **D-03:** `duration_ms` is included in `TaskCompleteMessage` — use it directly. No server-side timer needed.
- **D-04:** `user_id` for the usage record comes from `node_conn.user_id` (already available in the handler context).

### Backend — API (COST-02)

- **D-05:** Two new endpoints under a `/usage` router:
  - `GET /usage/` — paginated list of session-level usage records for the authenticated user. Query params: `period` (7d/30d/90d/all, default 30d), `page` (default 1), `page_size` (fixed 25). Returns records sorted newest-first.
  - `GET /usage/summary` — aggregate data for the selected period: `total_cost_usd`, `total_input_tokens`, `total_output_tokens`, `by_node` (list of `{node_id, node_name, cost_usd, session_count}`), `daily` (list of `{date, cost_usd}` for chart). Default period 30d, accepts same `period` param.
- **D-06:** Both endpoints require JWT auth (same pattern as other routes). Filter by `user_id` from the token — never expose other users' data.
- **D-07:** Extend `SessionPublic` (or create a `UsageRecordPublic`) to include `node_name` alongside `node_id` in the paginated list, so the frontend can display it without a secondary lookup.

### Frontend — Activity Feed (COST-02, session-level)

- **D-08:** When `taskComplete` fires, the activity feed item for that session updates to show full breakdown inline: `in:{N} out:{N} · {cost} · {duration}`. Example: `Task completed · in:900 out:312 · $0.04 · 42s`.
- **D-09:** The activity feed currently stores event data as JSON in the DB (`session_event.data`). The `taskComplete` event data already flows through; the feed endpoint (`activity.py`) should include cost fields from the associated `usage_record` when rendering `taskComplete` items.
- **D-10:** Duration display: `< 1s` for < 1000ms, `{N}s` for < 60s, `{M}m{S}s` for longer.

### Frontend — Usage Dashboard (/usage)

- **D-11:** Layout: summary stats at top (total cost, total sessions, period selector), then node totals with progress bars (as in the mockup), then a recharts `BarChart` of daily cost, then a paginated table of recent sessions.
- **D-12:** Default period: last 30 days. Period selector: 7d / 30d / 90d / All time. Changing period re-fetches both `/usage/summary` and `/usage/`.
- **D-13:** Session list: 25 per page, with Prev/Next controls. Columns: Date, Node, In tokens, Out tokens, Cost, Duration.
- **D-14:** Add `/usage` to the sidebar navigation (alongside Dashboard, Nodes, etc.).

### Cost Display Format

- **D-15:** Smart formatting throughout the UI:
  - `< $0.01` — for amounts less than $0.01
  - `$X.XX` — for $0.01–$9.99 (2 decimal places)
  - `$XX.XX` — for $10.00+ (2 decimal places)
  - Implement as a shared utility function `formatCost(usd: number): string` in `lib/utils.ts` or a new `lib/format.ts`.
- **D-16:** Zero cost (0.0): display as `$0.00`, not `< $0.01`. Only use `< $0.01` when cost > 0 but < 0.01.

### Claude's Discretion

- ORM query design for aggregations (SQLModel/SQLAlchemy group-by patterns)
- Exact recharts BarChart configuration (tooltip, axes, responsive container)
- Whether to join `usage_record` → `session` → `node` in one query or use separate lookups
- Pagination implementation (offset-based is fine; cursor-based not needed at this scale)
- Whether `GET /usage/` and `GET /usage/summary` share a router prefix `/api/usage/` or are added to the existing sessions router

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — COST-01, COST-02 requirements and acceptance criteria
- `.planning/ROADMAP.md` §Phase 12 — Success criteria (3 items) and phase goal

### Backend — Data Model
- `server/backend/app/models.py` — `UsageRecord` model (line ~311): session_id, user_id, input_tokens, output_tokens, cost_usd (float), duration_ms, created_at
- `server/backend/app/relay/protocol.py` — `TaskCompleteMessage` (line ~90): all cost fields with camelCase aliases; cost_usd is a string here

### Backend — Write Point
- `server/backend/app/api/routes/ws_node.py` — `taskComplete` handler (line ~253): current handler updates session status; UsageRecord insert goes here
- `server/backend/app/api/routes/activity.py` — Activity feed endpoint; extend `taskComplete` rendering to include usage data

### Backend — Existing Route Patterns
- `server/backend/app/api/routes/sessions.py` — Pattern for JWT-authed paginated list endpoints
- `server/backend/app/api/main.py` — Where new routers are registered (check for `/api` prefix pattern)

### Frontend — Activity Feed
- `server/frontend/src/components/activity/activity-sidebar.tsx` — Feed component; `taskComplete` items rendered here
- `server/frontend/src/lib/api/sessions.ts` — `SessionPublic` interface to reference/extend

### Frontend — Dashboard
- `server/frontend/src/App.tsx` — Route registration (add `/usage` route)
- `server/frontend/src/pages/dashboard.tsx` — Reference for page layout patterns
- `server/frontend/src/components/ui/` — Existing UI primitives to reuse (Card, Table, Badge, etc.)

### Protocol (Go side — source of truth)
- `node/protocol-go/messages.go` — `TaskComplete` struct (line ~117): `InputTokens`, `OutputTokens`, `CostUSD` (string), `DurationMs` (int64)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `recharts` ^2.15.0 already installed — `BarChart`, `ResponsiveContainer`, `Tooltip`, `XAxis`, `YAxis` available
- `UsageRecord` SQLModel model: fully defined, table exists after Phase 11 migration
- `TaskCompleteMessage` Pydantic model: all cost fields already parsed from protocol
- Existing Radix UI `Table`, `Card`, `Badge` primitives in `server/frontend/src/components/ui/`
- TanStack React Query already in use for data fetching — new usage endpoints integrate via `useQuery`

### Established Patterns
- DB writes in `ws_node.py`: use `with DBSession(engine) as db:` block, same as session status updates at line ~253
- REST API routes: FastAPI router with `Depends(get_current_user)` for auth, `APIRouter` registered in main
- Frontend API calls: `apiRequest<T>()` helper in `lib/api/` modules, wrapped in TanStack Query hooks
- Activity feed: `session_event` table stores raw JSON per event; `activity.py` renders feed from stored events

### Integration Points
- `ws_node.py` taskComplete handler: insert UsageRecord immediately after `crud.update_session_status` (completed)
- Activity feed `taskComplete` rendering: join with `usage_record` on `session_id` to get cost fields
- App.tsx routes: add `<Route path="/usage" element={<UsagePage />} />` alongside existing routes
- Sidebar navigation: add Usage link (check existing nav component for pattern)

</code_context>

<specifics>
## Specific Ideas

- Activity feed full breakdown format: `Task completed · in:900 out:312 · $0.04 · 42s` (user confirmed this verbosity)
- Dashboard mockup selected by user: total + node progress bars at top, daily BarChart in middle, paginated session table below
- Period selector: 7d / 30d / 90d / All time (30d default)
- Pagination: 25 per page with Prev/Next (no cursor needed)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 12-usage-tracking*
*Context gathered: 2026-04-11*
