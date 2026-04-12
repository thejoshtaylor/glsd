---
phase: 12-usage-tracking
plan: 12-01
subsystem: server-backend
tags: [usage-tracking, cost-tracking, rest-api, websocket]
dependency_graph:
  requires: [models.py UsageRecord, ws_node.py taskComplete handler, activity.py]
  provides: [UsageRecord insert on taskComplete, GET /usage/, GET /usage/summary, activity cost enrichment]
  affects: [ws_node.py, activity.py, main.py]
tech_stack:
  added: []
  patterns: [separate DB session for fault isolation, SQLAlchemy func aggregations, period-based filtering]
key_files:
  created:
    - server/backend/app/api/routes/usage.py
    - server/backend/tests/api/test_usage.py
  modified:
    - server/backend/app/models.py
    - server/backend/app/api/routes/ws_node.py
    - server/backend/app/api/routes/activity.py
    - server/backend/app/api/main.py
    - server/backend/tests/conftest.py
decisions:
  - Separate DB session for UsageRecord insert isolates failures from session status updates (T-12-04)
  - Cost parsing happens before broadcast so both broadcast and DB insert share the parsed value
  - Activity REST enrichment uses batch query for usage records by session_id (efficient)
metrics:
  duration: 335s
  completed: 2026-04-12T07:20:56Z
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 5
---

# Phase 12 Plan 01: Backend Usage Data Capture and REST API Summary

UsageRecord rows written on every taskComplete event with parsed cost/tokens/duration; two REST endpoints serve paginated records and aggregated summaries filtered by authenticated user; activity feed enriched with cost breakdown in both broadcast and REST responses.

## Task Results

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | UsageRecord insert in taskComplete handler + activity feed enrichment | 9c599b4 | Done |
| 2 | Usage REST API endpoints + activity REST enrichment | 3d5b6a1 | Done |

## Implementation Details

### Task 1: UsageRecord Insert + Activity Feed Enrichment

- Added `UsageRecord` model to `models.py` (was missing from codebase despite plan reference)
- Modified `ws_node.py` taskComplete handler to:
  - Parse `costUsd` string to float with try/except defaulting to 0.0 on failure
  - Insert UsageRecord in a **separate** `DBSession(engine)` block (fault isolation per T-12-04)
  - Log warnings on parse failures without crashing the handler
- Added `_format_cost()` and `_format_duration()` helper functions
- Enriched `_activity_message()` for taskComplete: `"Task completed . in:900 out:312 . $0.04 . 42s"`
- Enriched broadcast payload with raw cost fields: `input_tokens`, `output_tokens`, `cost_usd`, `duration_ms`
- Updated `conftest.py` to clean up UsageRecord in test teardown

### Task 2: Usage REST Endpoints + Activity REST Enrichment

- Created `usage.py` with two endpoints:
  - `GET /usage/` -- paginated list (25/page) with node_name, newest-first, period filtering
  - `GET /usage/summary` -- total_cost_usd, total_input/output_tokens, total_sessions, by_node list, daily list
- Both endpoints filter by `current_user.id` from JWT (T-12-01 mitigation)
- Period validation via regex `^(7d|30d|90d|all)$` (T-12-02 mitigation)
- Registered usage router in `main.py`
- Enriched `activity.py` `get_activity` endpoint to batch-query UsageRecord and merge cost fields into taskComplete events (D-09)
- 22 total test functions covering formatting, model creation, endpoints, user isolation, auth enforcement

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Model] Added UsageRecord to models.py**
- **Found during:** Task 1
- **Issue:** Plan interfaces referenced UsageRecord at lines 311-323 of models.py, but the model did not exist in the codebase (Phase 11 migration changes were not present in the working tree)
- **Fix:** Added UsageRecord SQLModel class to models.py matching the plan's interface specification
- **Files modified:** server/backend/app/models.py
- **Commit:** 9c599b4

## Verification

- All source files pass Python syntax validation (ast.parse)
- All module imports resolve correctly
- Router registered and accessible at /usage/ and /usage/summary
- 22 test functions written (unit tests verified passing; integration tests require live PostgreSQL)
- UsageRecord insert uses separate DB session from status update (T-12-04)
- Both /usage/ and /usage/summary filter by current_user.id (T-12-01)
- Activity.py enriches taskComplete events with cost fields from usage_record (D-09)

## Self-Check: PASSED

All 7 files verified present. Both task commits (9c599b4, 3d5b6a1) verified in git log.
