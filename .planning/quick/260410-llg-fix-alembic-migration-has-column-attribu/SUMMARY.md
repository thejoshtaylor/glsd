---
quick_id: 260410-llg
status: complete
date: 2026-04-10
---

# Summary: Fix Alembic migration has_column AttributeError

## What was done

Fixed `AttributeError: 'PGInspector' object has no attribute 'has_column'` in the `d2e3f4a5b6c7_add_name_to_node` Alembic migration.

Replaced the invalid `inspect(conn).has_column('node', 'name')` call with `get_columns('node')` list comprehension to check column existence idiomatically.

## Files changed

- `server/backend/app/alembic/versions/d2e3f4a5b6c7_add_name_to_node.py` — fix column existence check
