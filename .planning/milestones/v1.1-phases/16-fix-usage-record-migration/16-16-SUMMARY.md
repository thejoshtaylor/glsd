---
phase: 16
plan: 16
subsystem: backend/migrations
tags: [migration, database, usage-tracking, alembic]
dependency_graph:
  requires: [g1a2b3c4d5e6]
  provides: [p12_001_usage_record]
  affects: [usage_record table, COST-01, COST-02]
tech_stack:
  added: []
  patterns: [alembic migration, sqlalchemy column definitions, FK indexes]
key_files:
  created:
    - server/backend/app/alembic/versions/p12_001_add_usage_record.py
  modified: []
decisions:
  - Used g1a2b3c4d5e6 as down_revision (email verification migration, HEAD of chain)
  - Added server_default for numeric columns to avoid null constraint issues on existing rows
  - Created indexes on session_id and user_id for query performance
metrics:
  duration: 5m
  completed: "2026-04-13"
  tasks: 3
  files: 1
---

# Phase 16 Plan 16: Fix Usage Record Migration Summary

**One-liner:** Alembic migration p12_001_usage_record creates the missing usage_record table with FK indexes on session_id and user_id.

## What Was Built

Added the missing `usage_record` Alembic migration that was required by COST-01 and COST-02 requirements but was never created. The migration creates a `usage_record` table with:
- UUID primary key
- FK to session.id (indexed)
- FK to user.id (indexed)
- input_tokens, output_tokens (Integer, default 0)
- cost_usd (Float, default 0.0)
- duration_ms (Integer, default 0)
- created_at (DateTime with timezone, nullable)

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Create p12_001_add_usage_record.py migration | def5fd4 |
| 2 | Verify migration parses correctly (dry-run check) | def5fd4 |
| 3 | Commit | def5fd4 |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — migration adds a new internal table with no new network endpoints or auth paths.

## Self-Check: PASSED

- [x] `server/backend/app/alembic/versions/p12_001_add_usage_record.py` — FOUND
- [x] Commit def5fd4 — FOUND
