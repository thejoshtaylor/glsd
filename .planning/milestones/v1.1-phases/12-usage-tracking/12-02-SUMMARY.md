---
phase: 12-usage-tracking
plan: 12-02
subsystem: server-frontend
tags: [usage-tracking, cost-tracking, dashboard, react, recharts]
dependency_graph:
  requires: [GET /api/v1/usage/, GET /api/v1/usage/summary, UsageRecord model]
  provides: [/usage page, UsageSummaryCards, UsageNodeBreakdown, UsageDailyChart, UsageSessionTable, formatCost, formatDuration, formatTokenCount, activity cost display]
  affects: [App.tsx, navigation.ts, query-keys.ts, activity-event-item.tsx, use-activity-feed.ts]
tech_stack:
  added: []
  patterns: [useQuery with query key factory, lazy-loaded route, recharts BarChart, period state with page reset]
key_files:
  created:
    - server/frontend/src/lib/format.ts
    - server/frontend/src/lib/api/usage.ts
    - server/frontend/src/pages/usage.tsx
    - server/frontend/src/components/usage/usage-summary-cards.tsx
    - server/frontend/src/components/usage/usage-node-breakdown.tsx
    - server/frontend/src/components/usage/usage-daily-chart.tsx
    - server/frontend/src/components/usage/usage-session-table.tsx
  modified:
    - server/frontend/src/lib/query-keys.ts
    - server/frontend/src/lib/navigation.ts
    - server/frontend/src/components/activity/activity-event-item.tsx
    - server/frontend/src/hooks/use-activity-feed.ts
    - server/frontend/src/App.tsx
decisions:
  - New format.ts created rather than modifying existing utils.ts formatCost — existing version uses Intl.NumberFormat without sub-cent threshold; new version implements D-15/D-16 spec exactly
  - Activity cost extraction checks both top-level fields (SSE) and payload sub-object (REST) for backward compatibility
metrics:
  duration: 259s
  completed: 2026-04-12T07:29:20Z
  tasks_completed: 2
  tasks_total: 2
  files_created: 7
  files_modified: 5
---

# Phase 12 Plan 02: Frontend Usage Dashboard and Activity Feed Enrichment Summary

/usage page with summary cards (total cost, sessions, avg cost), per-node progress bar breakdown, recharts daily cost bar chart, and paginated session table; activity feed taskComplete events display inline cost breakdown with formatCost/formatDuration utilities.

## Task Results

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Shared utilities, API client, query keys, navigation, and activity feed update | 2ff109b | Done |
| 2 | Usage dashboard page with summary cards, node breakdown, chart, and session table | 6205f6a | Done |

## Implementation Details

### Task 1: Shared Utilities + API Client + Activity Feed

- Created `format.ts` with three formatters: `formatCost` (D-15/D-16 zero and sub-cent handling), `formatDuration` (D-10 human-readable), `formatTokenCount` (compact k suffix)
- Created `usage.ts` API client with full TypeScript interfaces (`UsageRecord`, `UsageListResponse`, `NodeUsage`, `DailyUsage`, `UsageSummary`, `Period`) and two fetch functions
- Added `usage`, `usageSummary`, `allUsage` query key factories to `query-keys.ts`
- Added `BarChart3` icon import and `Usage` nav item in Infrastructure section of `navigation.ts` (D-14)
- Extended `ActivityEvent` interface with optional `input_tokens`, `output_tokens`, `cost_usd`, `duration_ms` fields
- Enriched `activity-event-item.tsx` with `getTaskCompleteDetail()` helper that extracts cost fields from both top-level and payload sub-object, renders `in:N out:N . $X.XX . Ns` detail line (D-08)

### Task 2: Usage Dashboard Page + Components

- Created `UsageSummaryCards`: 3-column responsive grid with Total Cost, Total Sessions, Avg Cost/Session using tabular-nums font feature
- Created `UsageNodeBreakdown`: Card with nodes sorted by cost descending, Progress bars with percentage, session count display
- Created `UsageDailyChart`: recharts BarChart in ResponsiveContainer (240px mobile, 300px desktop) with formatted axes and dark-styled tooltip
- Created `UsageSessionTable`: HTML table with 6 columns (Date, Node, In Tokens, Out Tokens, Cost, Duration), Prev/Next pagination in CardFooter, empty state copywriting per UI-SPEC
- Created `UsagePage`: period state (default 30d) with page reset on change, two `useQuery` hooks, error state, PageHeader with Select action slot
- Registered lazy-loaded `/usage` route in App.tsx after node routes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript cast error in activity-event-item.tsx**
- **Found during:** Task 1 verification
- **Issue:** Direct cast from `ActivityEvent` to `Record<string, unknown>` failed TS2352 because neither type sufficiently overlaps
- **Fix:** Used double cast via `unknown` intermediate: `event as unknown as Record<string, unknown>`
- **Files modified:** server/frontend/src/components/activity/activity-event-item.tsx
- **Commit:** 2ff109b

## Verification

- TypeScript compiles without errors (`tsc --noEmit` exits 0)
- Vite production build succeeds (built in 3.31s)
- All 7 new files created, all 5 existing files modified
- Navigation contains Usage link with BarChart3 icon in Infrastructure section
- Activity event item renders cost detail for taskComplete events
- Usage page renders all four sections with period selector and pagination

## Self-Check: PASSED

All 7 created files verified present. Both task commits (2ff109b, 6205f6a) verified in git log.
