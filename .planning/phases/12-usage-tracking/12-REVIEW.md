---
phase: 12-usage-tracking
reviewed: 2026-04-12T20:30:00Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - server/backend/app/api/main.py
  - server/backend/app/api/routes/activity.py
  - server/backend/app/api/routes/usage.py
  - server/backend/app/api/routes/ws_node.py
  - server/backend/app/models.py
  - server/backend/tests/api/test_usage.py
  - server/backend/tests/conftest.py
  - server/frontend/src/App.tsx
  - server/frontend/src/components/activity/activity-event-item.tsx
  - server/frontend/src/components/usage/usage-daily-chart.tsx
  - server/frontend/src/components/usage/usage-node-breakdown.tsx
  - server/frontend/src/components/usage/usage-session-table.tsx
  - server/frontend/src/components/usage/usage-summary-cards.tsx
  - server/frontend/src/hooks/use-activity-feed.ts
  - server/frontend/src/lib/api/usage.ts
  - server/frontend/src/lib/format.ts
  - server/frontend/src/lib/navigation.ts
  - server/frontend/src/lib/query-keys.ts
  - server/frontend/src/pages/session-redirect.tsx
  - server/frontend/src/pages/usage.tsx
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-04-12T20:30:00Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

Phase 12 adds backend UsageRecord persistence on `taskComplete` events, two REST endpoints (`GET /usage/`, `GET /usage/summary`, `GET /usage/session/{id}`), activity feed enrichment with cost data, and a complete frontend usage dashboard with summary cards, daily chart, node breakdown, and paginated session table.

The implementation is well-structured. User isolation is correctly enforced at every query boundary. The previous review's H-01 (race condition on `manager.get_node()`) and M-02 (missing user filter on activity enrichment query) have both been fixed. Three warnings remain around missing input validation on the WebSocket ingestion path.

## Warnings

### WR-01: No type validation on UsageRecord numeric fields from WebSocket messages

**File:** `server/backend/app/api/routes/ws_node.py:317-320`
**Issue:** When inserting a `UsageRecord` from a `taskComplete` message, the fields `inputTokens`, `outputTokens`, and `durationMs` are extracted with `msg.get("inputTokens", 0)` and passed directly to the model. If the daemon sends non-integer values (strings, floats, null), they pass through without validation. The `UsageRecord` model defines these as `int` fields (via `Field(default=0)`), but SQLModel/SQLAlchemy may silently coerce or raise an unhandled `DataError` at commit time. The surrounding `except Exception` block (line 325) catches this, but the error message is generic and the root cause would be obscured.

**Fix:** Validate and coerce the numeric fields before constructing the record:

```python
try:
    in_tok = int(msg.get("inputTokens", 0))
    out_tok = int(msg.get("outputTokens", 0))
    dur = int(msg.get("durationMs", 0))
except (ValueError, TypeError):
    in_tok, out_tok, dur = 0, 0, 0
    logger.warning("Non-integer token/duration fields in taskComplete for session %s", session_id)

usage_record = UsageRecord(
    session_id=sid_uuid,
    user_id=usage_user_id,
    input_tokens=in_tok,
    output_tokens=out_tok,
    cost_usd=cost,
    duration_ms=dur,
)
```

### WR-02: SSE EventSource may fail to authenticate with JWT-based auth

**File:** `server/frontend/src/hooks/use-activity-feed.ts:49`
**Issue:** The SSE connection uses `new EventSource('/api/v1/activity/stream', { withCredentials: true })`. The `EventSource` API does not support custom headers, so the JWT Bearer token cannot be included. `withCredentials: true` only sends cookies. If the backend authenticates via `Authorization: Bearer` header (which the `CurrentUser` dependency expects), this SSE endpoint will return 401 for all users. This works only if the backend also accepts JWT from an HTTP-only cookie, which is not apparent from the reviewed code.

**Fix:** Either (a) ensure the backend's `CurrentUser` dependency also reads JWT from cookies, or (b) pass the token as a query parameter and modify the SSE endpoint to accept it:

```typescript
// Option (b): pass token as query param
const token = getAccessToken(); // from auth context
const source = new EventSource(`/api/v1/activity/stream?token=${token}`);
```

If cookie-based auth is already working, document this explicitly so future reviewers understand the auth flow.

### WR-03: Test fixture scope mismatch may cause inter-module data leakage

**File:** `server/backend/tests/conftest.py:16,35`
**Issue:** The `db` fixture is `scope="session"` (a single DB session shared across the entire test run) while `client` is `scope="module"`. Data written by one test module's tests persists in the DB session and is visible to subsequent modules. For example, `test_usage.py` creates users, nodes, sessions, and usage records that are never cleaned up between tests. The `test_usage_isolation` test's assertion `assert str(sess_b.id) not in session_ids_a` could pass or fail depending on test ordering if another module creates overlapping data. The cleanup in the `db` fixture's finally block only runs at session end, not between modules.

**Fix:** Either (a) use `scope="function"` for the `db` fixture so each test gets a clean transaction (with rollback), or (b) add per-test cleanup. Option (a) is more robust:

```python
@pytest.fixture(autouse=True)
def db_transaction(db: Session):
    """Wrap each test in a savepoint and rollback after."""
    db.begin_nested()
    yield db
    db.rollback()
```

## Info

### IN-01: Orphaned Tauri import in query-keys.ts

**File:** `server/frontend/src/lib/query-keys.ts:5`
**Issue:** Line 5 imports `AppLogFilters` from `"./tauri"`, a Tauri-specific module. Per project constraints (CLAUDE.md "Key Removals"), Tauri dependencies are being removed. This import was not introduced by Phase 12 but the file was modified to add usage query keys. If the `./tauri` module is eventually removed, this will cause a build error.
**Fix:** Migrate `AppLogFilters` to a non-Tauri module or inline the type where used.

### IN-02: formatCost does not handle negative values

**File:** `server/frontend/src/lib/format.ts:11-15`
**Issue:** `formatCost` only special-cases zero and the sub-cent range `(0, 0.01)`. A negative `cost_usd` value -- possible through data corruption or future credit/refund records -- renders as `$-X.XX`. This is cosmetic and unlikely in current usage.
**Fix:** Guard with `if (usd <= 0) return '$0.00';` or document that negatives are not expected.

### IN-03: Python and TypeScript formatCost/formatDuration are duplicated

**Files:** `server/backend/app/api/routes/ws_node.py:34-49`, `server/frontend/src/lib/format.ts:1-39`
**Issue:** `_format_cost` and `_format_duration` in `ws_node.py` duplicate the logic of `formatCost` and `formatDuration` in `format.ts`. The Python versions are only used for activity feed message strings, while the TypeScript versions render in the UI. If formatting rules change, both must be updated in sync. This is a maintainability concern, not a bug.
**Fix:** Consider moving the Python formatters to a shared utility module (e.g., `app/utils/format.py`) so they can be tested and updated independently of the WebSocket handler.

---

_Reviewed: 2026-04-12T20:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
