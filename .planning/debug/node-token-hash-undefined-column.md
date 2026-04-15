---
slug: node-token-hash-undefined-column
status: resolved
trigger: "sqlalchemy.exc.ProgrammingError: (psycopg.errors.UndefinedColumn) column node.token_hash does not exist"
created: 2026-04-15
updated: 2026-04-15
---

## Symptoms

- **Expected:** SQLAlchemy query against `node` table executes successfully
- **Actual:** `ProgrammingError: (psycopg.errors.UndefinedColumn) column node.token_hash does not exist`
- **Error:** `sqlalchemy.exc.ProgrammingError: (psycopg.errors.UndefinedColumn) column node.token_hash does not exist`
- **Timeline:** Unknown — likely introduced when token_hash field was added to the Node model
- **Reproduction:** Any query that references node.token_hash (e.g. node registration, authentication)

## Current Focus

hypothesis: "Migration a1b2c3d4e5f6 wraps the node table CREATE in `if not has_table('node')`, so pre-existing node tables never get token_hash added. Follow-up migrations exist for user_id and machine_id but not token_hash."
test: "Check if a migration exists that adds token_hash to an existing node table"
expecting: "No such migration exists"
next_action: "Create add-if-missing migration for token_hash"
reasoning_checkpoint: ""
tdd_checkpoint: ""

## Evidence

- timestamp: 2026-04-15 — Migration a1b2c3d4e5f6 creates node table with token_hash BUT guards with `if not inspect(conn).has_table("node")`, skipping entirely for pre-existing tables
- timestamp: 2026-04-15 — Follow-up migrations e3f4a5b6c7d8 and f4a5b6c7d8e9 add user_id and machine_id if missing, but no equivalent exists for token_hash
- timestamp: 2026-04-15 — Node model (models.py:144) defines `token_hash: str` as a required field, confirming SQLAlchemy expects the column to exist

## Eliminated

## Resolution

root_cause: "Migration a1b2c3d4e5f6 guards node table creation with `if not has_table('node')`. When the node table pre-exists (created by stub/earlier migration), the entire CREATE TABLE is skipped, so token_hash is never added. Unlike user_id and machine_id which have follow-up add-if-missing migrations, token_hash was missed."
fix: "Added migration p15_001_add_token_hash_to_node_if_missing.py that adds token_hash column if missing, backfills existing rows with placeholder, and sets NOT NULL."
verification: "Run alembic upgrade head — token_hash column will be added to pre-existing node tables."
files_changed: "server/backend/app/alembic/versions/p15_001_add_token_hash_to_node_if_missing.py"
