---
status: complete
quick_id: 260415-3j9
date: 2026-04-15
---

## What was done

Created `server/backend/app/alembic/versions/p16_001_add_node_runtime_columns_if_missing.py`.

The `a1b2c3d4e5f6` migration creates the `node` table with all runtime columns but skips table creation when the table already exists. Databases where `node` pre-dated that migration were missing: `is_revoked`, `connected_at`, `disconnected_at`, `last_seen`, `os`, `arch`, `daemon_version`, `created_at`.

The new migration follows the same guard pattern as `p15_001_add_token_hash_to_node_if_missing.py` — checks each column before adding it, so it's safe to run on any database regardless of state.

`is_revoked` uses `server_default=false` so existing rows get a valid non-null value without a backfill UPDATE.

## Files changed

- `server/backend/app/alembic/versions/p16_001_add_node_runtime_columns_if_missing.py` (new)
- `.planning/STATE.md` (quick tasks table)
