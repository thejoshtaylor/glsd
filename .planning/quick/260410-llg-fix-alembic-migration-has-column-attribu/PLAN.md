---
quick_id: 260410-llg
description: Fix Alembic migration has_column AttributeError in d2e3f4a5b6c7_add_name_to_node
date: 2026-04-10
status: complete
---

# Quick Task: Fix Alembic migration has_column AttributeError

## Problem

`alembic upgrade head` fails during prestart with:

```
AttributeError: 'PGInspector' object has no attribute 'has_column'. Did you mean: 'get_columns'?
```

File: `server/backend/app/alembic/versions/d2e3f4a5b6c7_add_name_to_node.py`, line 23.

## Root Cause

`PGInspector` (the PostgreSQL-specific Inspector returned by SQLAlchemy's `inspect()`) does not implement `has_column`. The generic `Inspector` base class had `has_column` in some SQLAlchemy versions, but it was removed or never available on the PostgreSQL dialect inspector. The correct API is `get_columns(table_name)` which returns a list of column dicts with a `name` key.

## Fix

Replace:
```python
if not inspect(conn).has_column('node', 'name'):
```

With:
```python
existing_columns = [col['name'] for col in inspect(conn).get_columns('node')]
if 'name' not in existing_columns:
```

## Files Changed

- `server/backend/app/alembic/versions/d2e3f4a5b6c7_add_name_to_node.py`
