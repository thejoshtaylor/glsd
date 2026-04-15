---
title: Fix missing DB columns — node.is_revoked and related fields
quick_id: 260415-3j9
date: 2026-04-15
---

## Problem

`sqlalchemy.exc.ProgrammingError: column node.is_revoked does not exist`

The `a1b2c3d4e5f6` migration creates the `node` table with all required columns, but only when the table doesn't already exist (`if not inspect(conn).has_table("node")`). On databases where the node table pre-existed that migration, columns like `is_revoked`, `connected_at`, `disconnected_at`, `last_seen`, `os`, `arch`, `daemon_version`, and `created_at` were never added.

Fix migrations already exist for `name`, `user_id`, `machine_id`, and `token_hash`, but not for the remaining missing columns.

## Fix

Create a new Alembic migration `p16_001_add_node_runtime_columns_if_missing.py` that:
1. Checks each potentially missing column
2. Adds missing columns with safe defaults
3. Chains off `p15_001_token_hash` (current head)

## Columns to guard

| Column | Type | Default |
|--------|------|---------|
| is_revoked | Boolean | FALSE (server_default) |
| connected_at | DateTime(tz) | NULL |
| disconnected_at | DateTime(tz) | NULL |
| last_seen | DateTime(tz) | NULL |
| os | String(50) | NULL |
| arch | String(50) | NULL |
| daemon_version | String(50) | NULL |
| created_at | DateTime(tz) | NULL |

## Tasks

1. Create migration file with column-existence guards
2. Verify migration chain is correct (down_revision = p15_001_token_hash)
