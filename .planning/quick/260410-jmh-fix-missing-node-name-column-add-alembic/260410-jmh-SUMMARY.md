# Quick Task 260410-jmh: Fix missing node.name column

**Status:** Complete
**Date:** 2026-04-10
**Commit:** 1ff618f

## What was done

Created Alembic migration `d2e3f4a5b6c7_add_name_to_node.py` to add the missing `name` column to the `node` table.

## Root cause

Migration `a1b2c3d4e5f6` creates the `node` table with a `name` column, but the table creation is guarded by `if not inspect(conn).has_table("node")`. On databases where the `node` table already existed from an earlier migration, the entire create block was skipped — meaning the `name` column was never added. Subsequent migrations (`b3c4d5e6f7a8`, `c1d2e3f4a5b6`) never added it either.

## Fix

`server/backend/app/alembic/versions/d2e3f4a5b6c7_add_name_to_node.py`:
- Chains off `c1d2e3f4a5b6` (the current head)
- Guards `add_column` with `inspect(conn).has_column('node', 'name')` — idempotent on both fresh and existing DBs
- Adds `name VARCHAR(255)` as nullable initially
- Backfills existing rows: `COALESCE(machine_id, 'unnamed')`
- Alters to NOT NULL after backfill
- `downgrade()` drops the column cleanly
