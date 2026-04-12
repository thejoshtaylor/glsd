# Phase 12: Usage Tracking - Research

**Researched:** 2026-04-11
**Domain:** Backend data capture (FastAPI/SQLModel), REST API pagination/aggregation, React dashboard with recharts
**Confidence:** HIGH

## Summary

Phase 12 adds two capabilities: (1) writing usage data to `usage_record` when `taskComplete` fires in `ws_node.py`, and (2) surfacing that data through two REST endpoints and a React dashboard at `/usage`. The entire backend data model (`UsageRecord` table) and the frontend charting library (`recharts ^2.15.0`) already exist in the project -- this phase is pure feature wiring with no new dependencies to install.

The backend work is straightforward: insert a `UsageRecord` row in the existing `taskComplete` handler block in `ws_node.py` (line ~253), add two new REST endpoints under a `/usage` router with JWT auth, and enrich the activity feed broadcast payload with cost fields. The frontend work creates a new `/usage` page with summary cards, per-node breakdown, a recharts BarChart, and a paginated session table -- all using existing UI primitives (Card, Progress, Select, Skeleton, Button).

**Primary recommendation:** Split into two plans -- backend (data capture + API endpoints + activity feed enrichment) and frontend (usage page + activity feed display update + navigation).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Write `UsageRecord` in the `taskComplete` handler in `ws_node.py` (line ~253), immediately after the existing `crud.update_session_status` call. Same DB session pattern as the surrounding code.
- **D-02:** `cost_usd` arrives as a string from the protocol (e.g., `"0.0123"`). Parse to `float` with a try/except; on parse failure default to `0.0` and log a warning. Do not crash the handler.
- **D-03:** `duration_ms` is included in `TaskCompleteMessage` -- use it directly. No server-side timer needed.
- **D-04:** `user_id` for the usage record comes from `node_conn.user_id` (already available in the handler context).
- **D-05:** Two new endpoints under a `/usage` router: `GET /usage/` (paginated list, 25/page, period filter) and `GET /usage/summary` (aggregates: total cost, total tokens, by_node, daily).
- **D-06:** Both endpoints require JWT auth. Filter by `user_id` from token.
- **D-07:** Extend response to include `node_name` alongside `node_id` in the paginated list.
- **D-08:** Activity feed `taskComplete` items show: `Task completed . in:{N} out:{N} . {cost} . {duration}`.
- **D-09:** Activity feed endpoint includes cost fields from associated `usage_record` when rendering `taskComplete` items.
- **D-10:** Duration display: `< 1s` for < 1000ms, `{N}s` for < 60s, `{M}m{S}s` for longer.
- **D-11:** Dashboard layout: summary stats top, node progress bars, recharts BarChart, paginated session table.
- **D-12:** Default period 30 days. Period selector: 7d / 30d / 90d / All time.
- **D-13:** Session list: 25 per page, Prev/Next controls. Columns: Date, Node, In tokens, Out tokens, Cost, Duration.
- **D-14:** Add `/usage` to sidebar navigation (Infrastructure section, after Nodes).
- **D-15:** Smart cost formatting: `< $0.01` for sub-cent, `$X.XX` for normal, shared `formatCost` utility.
- **D-16:** Zero cost displays as `$0.00`, not `< $0.01`.

### Claude's Discretion
- ORM query design for aggregations (SQLModel/SQLAlchemy group-by patterns)
- Exact recharts BarChart configuration (tooltip, axes, responsive container)
- Whether to join usage_record -> session -> node in one query or use separate lookups
- Pagination implementation (offset-based is fine)
- Whether `/usage/` and `/usage/summary` share a router prefix `/api/usage/` or join existing router

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| COST-01 | Server records inputTokens, outputTokens, costUsd, and durationMs from daemon taskComplete events into a usage_record table per session | Backend: `UsageRecord` model exists (models.py:311), `TaskCompleteMessage` has all fields (protocol.py:89), insert point identified in ws_node.py:253 |
| COST-02 | User can view usage history -- per-session breakdown and per-node totals with cost chart -- at /usage | Frontend: recharts already installed, all UI primitives exist, REST endpoints defined in D-05, UI-SPEC provides full layout contract |
</phase_requirements>

## Standard Stack

### Core (all already in project)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FastAPI | >=0.114.2 | REST endpoints + WebSocket handler | Already the backend framework [VERIFIED: server/backend pyproject.toml] |
| SQLModel | >=0.0.21 | ORM for UsageRecord queries + aggregation | Already the ORM; wraps SQLAlchemy for group-by [VERIFIED: existing code] |
| SQLAlchemy (func) | via SQLModel | Aggregation functions (sum, count, group_by) | SQLModel exposes `sqlalchemy.func` for aggregates [VERIFIED: SQLAlchemy docs] |
| React | 18.3.x | Frontend UI | Already in use [VERIFIED: package.json] |
| recharts | ^2.15.0 | BarChart for daily cost visualization | Already installed [VERIFIED: package.json] |
| TanStack React Query | ^5.62.0 | Data fetching hooks for usage endpoints | Already in use for all API calls [VERIFIED: package.json] |
| react-router-dom | ^7.1.1 | Route registration for `/usage` page | Already in use [VERIFIED: App.tsx] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Radix UI Progress | existing | Per-node cost breakdown bars | Node breakdown section |
| Radix UI Select | existing | Period selector (7d/30d/90d/All) | Page header action slot |
| Lucide React | existing | `BarChart3` icon for nav and page header | Navigation + PageHeader |

**Installation:** None required -- all dependencies already present.

## Architecture Patterns

### Backend: New Usage Router

**Pattern:** Dedicated `APIRouter` with `/usage` prefix, registered in `api/main.py`. [VERIFIED: existing pattern in sessions.py, nodes.py]

```python
# server/backend/app/api/routes/usage.py
from fastapi import APIRouter, Query
from app.api.deps import CurrentUser, SessionDep

router = APIRouter(prefix="/usage", tags=["usage"])

@router.get("/")
def list_usage_records(
    session: SessionDep,
    current_user: CurrentUser,
    period: str = Query(default="30d", regex="^(7d|30d|90d|all)$"),
    page: int = Query(default=1, ge=1),
) -> dict:
    ...

@router.get("/summary")
def get_usage_summary(
    session: SessionDep,
    current_user: CurrentUser,
    period: str = Query(default="30d", regex="^(7d|30d|90d|all)$"),
) -> dict:
    ...
```

Registration in `api/main.py`:
```python
from app.api.routes import usage
api_router.include_router(usage.router)
```

[VERIFIED: exact pattern matches sessions.py router registration]

### Backend: UsageRecord Insert in taskComplete Handler

**Pattern:** Same `with DBSession(engine) as db:` block as the existing `crud.update_session_status` call. Insert immediately after it. [VERIFIED: ws_node.py lines 253-261]

```python
elif msg_type == "taskComplete":
    with DBSession(engine) as db:
        crud.update_session_status(
            session=db, session_id=sid_uuid,
            status="completed", completed_at=datetime.now(timezone.utc),
            claude_session_id=msg.get("claudeSessionId"),
        )
    # NEW: Write usage record
    with DBSession(engine) as db:
        try:
            cost = float(msg.get("costUsd", "0"))
        except (ValueError, TypeError):
            cost = 0.0
            logger.warning("Invalid costUsd in taskComplete for session %s", session_id)
        usage_record = UsageRecord(
            session_id=sid_uuid,
            user_id=uuid.UUID(node_conn.user_id),
            input_tokens=msg.get("inputTokens", 0),
            output_tokens=msg.get("outputTokens", 0),
            cost_usd=cost,
            duration_ms=msg.get("durationMs", 0),
        )
        db.add(usage_record)
        db.commit()
```

Note: Uses a separate `with DBSession` block (not combined with status update) to isolate failures -- if usage write fails, the session status has already been committed. [ASSUMED]

### Backend: SQLAlchemy Aggregation for /usage/summary

**Pattern:** Use `sqlalchemy.func` for server-side aggregation. [VERIFIED: standard SQLAlchemy pattern]

```python
from sqlalchemy import func
from sqlmodel import select

# Total aggregates
stmt = (
    select(
        func.sum(UsageRecord.cost_usd).label("total_cost"),
        func.sum(UsageRecord.input_tokens).label("total_input"),
        func.sum(UsageRecord.output_tokens).label("total_output"),
        func.count(UsageRecord.id).label("total_sessions"),
    )
    .where(UsageRecord.user_id == user_id)
    .where(UsageRecord.created_at >= cutoff_date)
)

# Per-node breakdown
node_stmt = (
    select(
        Node.id,
        Node.name,
        func.sum(UsageRecord.cost_usd).label("cost_usd"),
        func.count(UsageRecord.id).label("session_count"),
    )
    .join(SessionModel, UsageRecord.session_id == SessionModel.id)
    .join(Node, SessionModel.node_id == Node.id)
    .where(UsageRecord.user_id == user_id)
    .where(UsageRecord.created_at >= cutoff_date)
    .group_by(Node.id, Node.name)
)

# Daily breakdown (for chart)
daily_stmt = (
    select(
        func.date(UsageRecord.created_at).label("date"),
        func.sum(UsageRecord.cost_usd).label("cost_usd"),
    )
    .where(UsageRecord.user_id == user_id)
    .where(UsageRecord.created_at >= cutoff_date)
    .group_by(func.date(UsageRecord.created_at))
    .order_by(func.date(UsageRecord.created_at))
)
```

**PostgreSQL note:** `func.date()` maps to `DATE()` in PostgreSQL, which truncates timestamp to date. This is the correct approach for daily grouping with timezone-aware timestamps. [VERIFIED: PostgreSQL documentation]

### Backend: Period Filter Helper

```python
from datetime import datetime, timedelta, timezone

def get_cutoff_date(period: str) -> datetime | None:
    """Convert period string to cutoff datetime. Returns None for 'all'."""
    now = datetime.now(timezone.utc)
    mapping = {"7d": 7, "30d": 30, "90d": 90}
    days = mapping.get(period)
    return now - timedelta(days=days) if days else None
```

### Frontend: API Module Pattern

**Pattern:** New `src/lib/api/usage.ts` matching existing `sessions.ts` pattern. [VERIFIED: sessions.ts, nodes.ts]

```typescript
// src/lib/api/usage.ts
import { apiRequest } from './client';

export interface UsageRecord {
  id: string;
  session_id: string;
  node_id: string;
  node_name: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  duration_ms: number;
  created_at: string;
}

export interface UsageListResponse {
  data: UsageRecord[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface NodeUsage {
  node_id: string;
  node_name: string;
  cost_usd: number;
  session_count: number;
}

export interface DailyUsage {
  date: string;
  cost_usd: number;
}

export interface UsageSummary {
  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_sessions: number;
  by_node: NodeUsage[];
  daily: DailyUsage[];
}

export type Period = '7d' | '30d' | '90d' | 'all';

export async function getUsageList(period: Period = '30d', page: number = 1): Promise<UsageListResponse> {
  return apiRequest<UsageListResponse>(`/usage/?period=${period}&page=${page}`);
}

export async function getUsageSummary(period: Period = '30d'): Promise<UsageSummary> {
  return apiRequest<UsageSummary>(`/usage/summary?period=${period}`);
}
```

### Frontend: Query Keys Extension

Add to `src/lib/query-keys.ts`: [VERIFIED: existing pattern]

```typescript
// Usage
usage: (period: string, page: number) => ['usage', period, page] as const,
usageSummary: (period: string) => ['usage', 'summary', period] as const,
allUsage: () => ['usage'] as const,
```

### Frontend: Page Registration

**Pattern:** Lazy-loaded page component matching existing App.tsx pattern. [VERIFIED: App.tsx]

```typescript
const UsagePage = lazy(() => import("./pages/usage").then(m => ({ default: m.UsagePage })));
// In Routes:
<Route path="/usage" element={<UsagePage />} />
```

### Frontend: Navigation Addition

Add to `src/lib/navigation.ts` in Infrastructure section after Nodes: [VERIFIED: navigation.ts line 44]

```typescript
import { BarChart3 } from 'lucide-react';
// After line 44:
{ type: 'link', name: 'Usage', href: '/usage', icon: BarChart3 },
```

### Frontend: Utility Functions

Create `src/lib/format.ts` with shared formatters per D-15, D-16, D-10: [VERIFIED: UI-SPEC contract]

```typescript
export function formatCost(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd > 0 && usd < 0.01) return '< $0.01';
  return `$${usd.toFixed(2)}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return '< 1s';
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m${seconds}s`;
}

export function formatTokenCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
```

### Anti-Patterns to Avoid
- **Combining usage write with session status update in same DB session:** If usage write fails, it would roll back the status update. Keep them in separate `with DBSession` blocks.
- **Client-side aggregation:** Do not fetch all usage records and aggregate in React. Use SQL `GROUP BY` on the server.
- **Exposing other users' data:** Every query MUST filter by `user_id` from the JWT token. Never accept `user_id` as a query parameter.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chart rendering | Custom SVG/Canvas chart | recharts BarChart (already installed) | Responsive, tooltips, axes all handled |
| Progress bars | Custom CSS progress bars | Radix UI Progress (existing component) | Accessible, animated, variant support built in |
| Pagination math | Manual offset calculation | Simple `(page - 1) * page_size` offset | Offset-based is correct at this scale; cursor-based unnecessary |
| Cost/duration formatting | Inline template strings | Shared `formatCost`/`formatDuration` utilities | Used in activity feed AND dashboard; single source of truth |
| Period date math | Manual date arithmetic per endpoint | Shared `get_cutoff_date()` helper | Both endpoints need the same period-to-date conversion |

## Common Pitfalls

### Pitfall 1: cost_usd String-to-Float Parse Failure
**What goes wrong:** Protocol sends `costUsd` as a string (e.g., `"0.0123"`). Parsing `float("")` or `float(None)` crashes the handler, breaking WebSocket processing for all sessions on that node.
**Why it happens:** The daemon might send empty or malformed cost data if Claude Code exits abnormally.
**How to avoid:** Wrap in try/except with default `0.0` and log warning (per D-02).
**Warning signs:** TypeError or ValueError in ws_node.py logs.

### Pitfall 2: Missing User ID Filtering on Usage Endpoints
**What goes wrong:** Usage data from other users is visible.
**Why it happens:** Forgetting to add `.where(UsageRecord.user_id == current_user.id)` to queries.
**How to avoid:** Both `/usage/` and `/usage/summary` MUST filter by `current_user.id`. Add test verifying user A cannot see user B's data.
**Warning signs:** Usage totals seem too high during testing.

### Pitfall 3: Timezone-Naive Date Grouping
**What goes wrong:** Daily cost chart shows incorrect date boundaries when server timezone differs from UTC.
**Why it happens:** Using `func.date()` on timezone-aware timestamps without explicit timezone handling.
**How to avoid:** `UsageRecord.created_at` is `DateTime(timezone=True)`. PostgreSQL `DATE()` function respects the session timezone (default UTC). This should work correctly with the existing setup but verify the daily bucketing in tests.
**Warning signs:** Events near midnight appearing on the wrong day.

### Pitfall 4: Activity Feed Payload Not Including Cost Data
**What goes wrong:** Activity feed shows "Task completed" without cost breakdown even after the backend is updated.
**Why it happens:** The broadcaster `publish()` call in ws_node.py constructs the event payload at publish time. The `_activity_message` function currently returns just `"Task completed"`. Two changes needed: (1) update the broadcast payload to include cost fields, (2) update the frontend `ActivityEventItem` to render them.
**How to avoid:** Enrich the broadcast payload with `input_tokens`, `output_tokens`, `cost_usd`, `duration_ms` for `taskComplete` events. Update `_activity_message` to include the breakdown text. Update `ActivityEventItem` rendering.
**Warning signs:** SSE events arriving without cost fields in browser dev tools.

### Pitfall 5: recharts BarChart Empty Data
**What goes wrong:** BarChart renders an empty box with no visual feedback when there's no data for the selected period.
**Why it happens:** recharts renders axes but no bars when `data=[]`.
**How to avoid:** Check `daily.length === 0` and show the empty state text from the UI-SPEC instead of the chart component.
**Warning signs:** Empty chart box with just axis lines.

## Code Examples

### Backend: Complete Usage Router

```python
# Source: derived from sessions.py pattern + D-05/D-06/D-07 decisions
# server/backend/app/api/routes/usage.py

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Query
from sqlalchemy import func
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.models import Node, SessionModel, UsageRecord

router = APIRouter(prefix="/usage", tags=["usage"])

def _cutoff(period: str) -> datetime | None:
    mapping = {"7d": 7, "30d": 30, "90d": 90}
    days = mapping.get(period)
    return datetime.now(timezone.utc) - timedelta(days=days) if days else None

PAGE_SIZE = 25

@router.get("/")
def list_usage(
    session: SessionDep,
    current_user: CurrentUser,
    period: str = Query(default="30d", pattern="^(7d|30d|90d|all)$"),
    page: int = Query(default=1, ge=1),
) -> dict:
    cutoff = _cutoff(period)
    base = (
        select(UsageRecord, Node.name.label("node_name"))
        .join(SessionModel, UsageRecord.session_id == SessionModel.id)
        .join(Node, SessionModel.node_id == Node.id)
        .where(UsageRecord.user_id == current_user.id)
    )
    if cutoff:
        base = base.where(UsageRecord.created_at >= cutoff)

    # Count
    count_stmt = select(func.count()).select_from(
        base.subquery()
    )
    total = session.exec(count_stmt).one()

    # Paginated results
    offset = (page - 1) * PAGE_SIZE
    rows = session.exec(
        base.order_by(UsageRecord.created_at.desc())
        .offset(offset)
        .limit(PAGE_SIZE)
    ).all()

    return {
        "data": [
            {
                "id": str(r.UsageRecord.id),
                "session_id": str(r.UsageRecord.session_id),
                "node_name": r.node_name,
                "input_tokens": r.UsageRecord.input_tokens,
                "output_tokens": r.UsageRecord.output_tokens,
                "cost_usd": r.UsageRecord.cost_usd,
                "duration_ms": r.UsageRecord.duration_ms,
                "created_at": r.UsageRecord.created_at.isoformat() if r.UsageRecord.created_at else None,
            }
            for r in rows
        ],
        "total": total,
        "page": page,
        "page_size": PAGE_SIZE,
        "total_pages": max(1, -(-total // PAGE_SIZE)),  # ceiling division
    }
```

### Frontend: recharts BarChart Configuration

```typescript
// Source: recharts documentation + UI-SPEC contract
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCost } from '@/lib/format';

interface DailyChartProps {
  data: { date: string; cost_usd: number }[];
}

function UsageDailyChart({ data }: DailyChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[240px] sm:h-[300px] text-sm text-muted-foreground">
        No node activity in this period
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300} className="hidden sm:block">
      <BarChart data={data}>
        <XAxis
          dataKey="date"
          tickFormatter={(d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          tick={{ fontSize: 12 }}
          stroke="hsl(var(--muted-foreground))"
        />
        <YAxis
          tickFormatter={(v) => `$${v}`}
          tick={{ fontSize: 12 }}
          stroke="hsl(var(--muted-foreground))"
          width={50}
        />
        <Tooltip
          formatter={(value: number) => [formatCost(value), 'Cost']}
          labelFormatter={(label) => new Date(label).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
        />
        <Bar dataKey="cost_usd" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

### Frontend: Activity Feed taskComplete Enrichment

```typescript
// In ActivityEventItem, detect taskComplete with cost data in payload
// payload comes from the SSE event or initial REST load
if (event.event_type === 'taskComplete' && event.payload) {
  const p = event.payload;
  const costStr = typeof p.cost_usd === 'number' ? formatCost(p.cost_usd) : '';
  const durStr = typeof p.duration_ms === 'number' ? formatDuration(p.duration_ms) : '';
  const inStr = typeof p.input_tokens === 'number' ? String(p.input_tokens) : '';
  const outStr = typeof p.output_tokens === 'number' ? String(p.output_tokens) : '';
  // Format: "Task completed . in:900 out:312 . $0.04 . 42s"
  message = `Task completed`;
  if (inStr && outStr) {
    detail = `in:${inStr} out:${outStr} . ${costStr} . ${durStr}`;
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No usage tracking | UsageRecord table + REST API + dashboard | Phase 12 (new) | Users can now see per-session costs |

**No deprecated/outdated patterns** -- this is greenfield feature work on an established stack.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest (backend), vitest (frontend -- if configured) |
| Config file | server/backend has pytest; frontend TBD |
| Quick run command | `cd server/backend && python -m pytest tests/ -x -q` |
| Full suite command | `cd server/backend && python -m pytest tests/ -v` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COST-01 | UsageRecord created on taskComplete | unit | `pytest tests/test_usage.py::test_usage_record_created_on_task_complete -x` | Wave 0 |
| COST-01 | cost_usd parse failure defaults to 0.0 | unit | `pytest tests/test_usage.py::test_cost_parse_failure_defaults_zero -x` | Wave 0 |
| COST-02 | GET /usage/ returns paginated records for authenticated user | unit | `pytest tests/test_usage.py::test_list_usage_authenticated -x` | Wave 0 |
| COST-02 | GET /usage/summary returns aggregates | unit | `pytest tests/test_usage.py::test_usage_summary_aggregates -x` | Wave 0 |
| COST-02 | User cannot see other users' usage data | unit | `pytest tests/test_usage.py::test_usage_isolation -x` | Wave 0 |
| COST-02 | Period filter restricts date range | unit | `pytest tests/test_usage.py::test_period_filter -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd server/backend && python -m pytest tests/test_usage.py -x -q`
- **Per wave merge:** `cd server/backend && python -m pytest tests/ -v`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `server/backend/tests/test_usage.py` -- covers COST-01 and COST-02
- [ ] Fixtures for UsageRecord creation in test DB

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Existing `CurrentUser` dependency (JWT cookie auth) |
| V3 Session Management | no | No new session handling |
| V4 Access Control | yes | All queries filter by `user_id` from JWT -- no cross-user data access |
| V5 Input Validation | yes | `period` param validated via regex pattern; `page` validated via `ge=1` |
| V6 Cryptography | no | No new crypto operations |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IDOR on usage data | Information Disclosure | All queries filter by `current_user.id` from JWT, never from query params |
| SQL injection via period param | Tampering | FastAPI Query validation with regex pattern `^(7d|30d|90d|all)$` |
| Cost manipulation by rogue node | Tampering | Cost data comes from authenticated node connection; node ownership verified at session creation. No additional mitigation needed at this layer. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Separate `with DBSession` blocks for status update and usage write is the correct isolation strategy | Architecture Patterns | If wrong, usage write failure might leave inconsistent state; could combine into single transaction if preferred |
| A2 | PostgreSQL `DATE()` function on timezone-aware timestamps groups by UTC date correctly | Pitfall 3 | Daily chart could show wrong date boundaries near midnight |
| A3 | SQLModel `select()` with `.join()` and `func.sum()` works with the cross-table pattern shown | Code Examples | May need raw SQLAlchemy `select()` instead of SQLModel wrapper for complex aggregation |

## Open Questions

1. **Activity feed: enrich broadcast vs. enrich REST endpoint?**
   - What we know: D-09 says "include cost fields from associated usage_record when rendering taskComplete items". The SSE broadcast happens before the UsageRecord is written.
   - What's unclear: Should we (a) add cost fields to the broadcast payload directly from `msg` (available at broadcast time), or (b) have the REST `/activity` endpoint JOIN with usage_record?
   - Recommendation: Both. Add cost fields to the broadcast payload from `msg` for live SSE events. Also update the REST `/activity` endpoint to JOIN with `usage_record` for historical events loaded on page refresh. This ensures both live and historical events show cost data.

2. **Response model typing for usage endpoints**
   - What we know: Existing endpoints use `response_model=SessionPublic` Pydantic/SQLModel types
   - What's unclear: Whether to create formal Pydantic response models or return plain dicts
   - Recommendation: Create `UsageRecordPublic` and `UsageSummaryResponse` Pydantic models for type safety and OpenAPI docs. Matches existing codebase patterns.

## Sources

### Primary (HIGH confidence)
- `server/backend/app/models.py` lines 311-323 -- UsageRecord model definition
- `server/backend/app/relay/protocol.py` lines 89-100 -- TaskCompleteMessage fields
- `server/backend/app/api/routes/ws_node.py` lines 253-261 -- taskComplete handler insertion point
- `server/backend/app/api/routes/sessions.py` -- JWT auth pattern with `CurrentUser` dependency
- `server/backend/app/api/routes/activity.py` -- Activity feed endpoint pattern
- `server/backend/app/api/main.py` -- Router registration pattern
- `server/frontend/src/lib/api/client.ts` -- `apiRequest<T>()` pattern
- `server/frontend/src/lib/api/sessions.ts` -- API module pattern
- `server/frontend/src/lib/query-keys.ts` -- Query key factory pattern
- `server/frontend/src/lib/navigation.ts` -- Navigation item registration
- `server/frontend/src/App.tsx` -- Route registration with lazy loading
- `server/frontend/src/components/ui/progress.tsx` -- Progress bar with variants
- `.planning/phases/12-usage-tracking/12-UI-SPEC.md` -- Full UI design contract
- `.planning/phases/12-usage-tracking/12-CONTEXT.md` -- All locked decisions

### Secondary (MEDIUM confidence)
- SQLAlchemy `func.sum()`, `func.count()`, `func.date()` patterns -- standard documented SQLAlchemy [CITED: docs.sqlalchemy.org]
- recharts BarChart API -- standard documented recharts [CITED: recharts.org/en-US/api]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in project, no new dependencies
- Architecture: HIGH -- follows existing patterns exactly (router, deps, API client, query keys)
- Pitfalls: HIGH -- identified from direct code inspection of ws_node.py and activity feed chain

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (stable -- no moving targets)
