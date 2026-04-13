# Phase 16: Fix Usage Record Migration — Plan

**Phase Goal:** The usage_record table exists in every fresh deploy; COST-01 and COST-02 are no longer broken by a missing migration

**Requirements:** COST-01, COST-02

---

## Task 1: Create Alembic migration for usage_record table

**File:** `server/backend/app/alembic/versions/p12_001_add_usage_record.py`

Create an Alembic migration that:
- `revision = "p12_001_usage_record"`
- `down_revision = "g1a2b3c4d5e6"` (current HEAD)
- Creates `usage_record` table with columns:
  - `id` — UUID, primary key
  - `session_id` — UUID, FK to session.id, non-nullable, indexed
  - `user_id` — UUID, FK to user.id, non-nullable, indexed
  - `input_tokens` — Integer, default 0
  - `output_tokens` — Integer, default 0
  - `cost_usd` — Float, default 0.0
  - `duration_ms` — Integer, default 0
  - `created_at` — DateTime(timezone=True), nullable
- `downgrade()` drops indexes then table

**Success check:** File created with correct revision IDs and column definitions.

---

## Task 2: Verify migration runs cleanly (dry-run check)

Run `alembic check` or inspect that the migration file parses correctly:

```bash
cd server/backend && python -c "
from app.alembic.versions.p12_001_add_usage_record import upgrade, downgrade
print('Migration parses OK')
"
```

This confirms the file is importable without errors.

---

## Task 3: Commit

Commit message: `fix(migration): add missing usage_record migration (COST-01, COST-02)`
