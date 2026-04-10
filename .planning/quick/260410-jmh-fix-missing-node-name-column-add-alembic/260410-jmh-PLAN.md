---
quick_id: 260410-jmh
slug: fix-missing-node-name-column-add-alembic
description: "Fix missing node.name column — add Alembic migration to add name column to node table"
date: 2026-04-10
---

# Quick Task 260410-jmh: Fix missing node.name column

## Root Cause

`a1b2c3d4e5f6` creates the `node` table with a `name` column, but the create is guarded by
`if not inspect(conn).has_table("node")`. When the DB already had a `node` table from an
earlier migration, the entire create block was skipped — including the `name` column.
Subsequent migrations (`b3c4d5e6f7a8`, `c1d2e3f4a5b6`) never added it.

## Tasks

### Task 1: Create Alembic migration to add name column to node table

**Files:**
- `server/backend/app/alembic/versions/d2e3f4a5b6c7_add_name_to_node.py` (create)

**Action:** Create a new Alembic migration that:
1. Adds `name VARCHAR(255)` column to the `node` table
2. Guards with `inspect(conn).has_column("node", "name")` to be idempotent
3. Backfills existing rows with a placeholder (`machine_id` if present, else `'unnamed'`)
4. Sets column NOT NULL after backfill
5. Provides a proper downgrade

**Revision chain:** `down_revision = 'c1d2e3f4a5b6'` (latest migration)

**Verify:** Migration file exists and is syntactically correct; `down_revision` points to `c1d2e3f4a5b6`

**Done:** When migration is committed and the node table will have a `name` column after running `alembic upgrade head`
