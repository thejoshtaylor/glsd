---
phase: 12
status: issues-found
critical: 0
high: 1
medium: 2
low: 3
---

# Phase 12 Code Review

## Summary

Phase 12 adds backend UsageRecord capture on `taskComplete` events, two REST endpoints (`GET /usage/`, `GET /usage/summary`), activity feed enrichment, and a full frontend usage dashboard. The implementation is largely correct and well-structured; user isolation is enforced at every query boundary. One high-severity bug exists in `ws_node.py` where a redundant `get_node()` call introduces a race condition that silently drops UsageRecord rows on disconnect.

## Findings

### High

#### H-01: Silent UsageRecord drop on concurrent disconnect (ws_node.py, lines 312–314)

**File:** `server/backend/app/api/routes/ws_node.py:312-314`

**Issue:** After a `taskComplete` event is processed, the code calls `manager.get_node(machine_id)` a second time to retrieve `user_id` for the UsageRecord insert. However, `user_id` is already captured as a local string variable at line 136 (`user_id = str(node.user_id)`). If the node disconnects between session event processing and this point, `manager.get_node(machine_id)` returns `None`, `usage_user_id` is `None`, and the `if usage_user_id:` guard causes the UsageRecord to be silently skipped. The `taskComplete` event was successfully persisted and the session status was updated, but the usage row is never written. No error is logged and the caller receives no indication.

```python
# Buggy — get_node() may return None if node disconnected concurrently
node_conn = manager.get_node(machine_id)
usage_user_id = uuid.UUID(node_conn.user_id) if node_conn else None
if usage_user_id:
    ...
```

**Fix:** Use the already-captured `user_id` string variable directly instead of re-querying the connection manager:

```python
# In the taskComplete block (around line 312), replace the three lines above with:
try:
    usage_user_id = uuid.UUID(user_id)  # user_id captured at line 136
    with DBSession(engine) as db:
        usage_record = UsageRecord(
            session_id=sid_uuid,
            user_id=usage_user_id,
            input_tokens=msg.get("inputTokens", 0),
            output_tokens=msg.get("outputTokens", 0),
            cost_usd=cost,
            duration_ms=msg.get("durationMs", 0),
        )
        db.add(usage_record)
        db.commit()
except Exception:
    logger.warning(
        "Failed to insert UsageRecord for session %s",
        session_id,
        exc_info=True,
    )
```

---

### Medium

#### M-01: Off-by-one date display in daily chart and session table (UTC-offset timezones)

**Files:**
- `server/frontend/src/components/usage/usage-daily-chart.tsx:18`
- `server/frontend/src/components/usage/usage-session-table.tsx:19-26`

**Issue:** The backend returns daily breakdown dates as bare date strings (e.g. `"2026-04-12"`) from PostgreSQL's `func.date()`. In `usage-daily-chart.tsx`, `formatDateLabel` parses these with `new Date(d)`, which treats a date-only string as UTC midnight (per ECMA-262). In a UTC-5 timezone, `new Date("2026-04-12")` is `2026-04-11T19:00:00` local time, so the label renders as April 11 instead of April 12. Users in UTC− timezones will see all daily chart labels shifted one day earlier. The same issue exists in `usage-session-table.tsx`'s `formatShortDate` for the `created_at` ISO timestamp — though that one is a full ISO timestamp with timezone info so the date will render correctly; the chart-specific date-only string is the actual problem.

**Fix:** Parse date-only strings without the UTC midnight trap by splitting the string or by appending a local noon time:

```typescript
// usage-daily-chart.tsx line 18
function formatDateLabel(d: string): string {
  // Append T12:00:00 to prevent UTC-midnight shifting to previous day in UTC- timezones
  const date = d.length === 10 ? new Date(`${d}T12:00:00`) : new Date(d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
```

---

#### M-02: `activity.py` usage enrichment query not scoped to current_user (defense-in-depth gap)

**File:** `server/backend/app/api/routes/activity.py:51-57`

**Issue:** The batch UsageRecord query at lines 51–57 fetches all UsageRecords matching `session_id IN (tc_session_ids)` but does not add a `UsageRecord.user_id == current_user.id` filter. The `tc_session_ids` list is derived from sessions already filtered to `current_user.id` (line 31–35), so in practice no cross-user data leaks. However, if a UsageRecord were ever written with a mismatched `user_id` (e.g. a data consistency bug), it could be surfaced in another user's activity response. Defense-in-depth requires each query to enforce ownership independently.

**Fix:** Add the user filter to the UsageRecord batch query:

```python
usage_rows = session.exec(
    select(UsageRecord).where(
        col(UsageRecord.session_id).in_(tc_session_ids),
        UsageRecord.user_id == current_user.id,  # defense-in-depth
    )
).all()
```

---

### Low

#### L-01: `formatCost` does not handle negative values

**File:** `server/frontend/src/lib/format.ts:11-15`

**Issue:** `formatCost` only special-cases zero and the sub-cent range `(0, 0.01)`. A negative `cost_usd` value — possible through data corruption or future credit/refund records — renders as `$-X.XX` with no special handling. This is a minor display issue.

**Fix:** Add a negative guard or document that negatives are not expected:

```typescript
export function formatCost(usd: number): string {
  if (usd <= 0) return '$0.00';  // treats negative as zero for display
  if (usd < 0.01) return '< $0.01';
  return `$${usd.toFixed(2)}`;
}
```

Note: If credits/refunds are ever added as negative records, this guard should be revisited to show them distinctly.

---

#### L-02: `_format_cost` in ws_node.py does not match `formatCost` in format.ts on the zero boundary

**File:** `server/backend/app/api/routes/ws_node.py:35-40`

**Issue:** The Python helper uses `if cost == 0` (strict equality) while the TypeScript version uses `if (usd === 0)`. Floating-point cost values that parse to very small negatives (e.g. `-0.0` or a rounding artifact producing `-1e-15`) would fall through the zero check and be formatted as `< $0.01` (if positive) or as `$-0.00` / `$-0.00` (if negative). This is a low-risk edge case but the two implementations are subtly inconsistent in the zero-boundary handling. The TypeScript version should also guard for `usd <= 0` to be truly consistent.

**Fix:** Both implementations should treat `<= 0` as the zero boundary, or document that negative costs are not possible by design.

---

#### L-03: Orphaned Tauri import in query-keys.ts

**File:** `server/frontend/src/lib/query-keys.ts:6`

**Issue:** Line 6 imports `AppLogFilters` from `"./tauri"`, a Tauri-specific module. Per project constraints, Tauri dependencies are being removed (the CLAUDE.md lists all `@tauri-apps/*` packages under "Key Removals"). This import was not introduced by Phase 12 but the file was modified in this phase. The import may cause a TypeScript error or dead dependency if the tauri module is eventually removed.

**Fix:** Confirm whether `./tauri` still exists and is intentionally kept as an adapter module. If Tauri removal is complete, migrate `AppLogFilters` to a cloud-native type or remove the `appLogs` query keys entirely.
