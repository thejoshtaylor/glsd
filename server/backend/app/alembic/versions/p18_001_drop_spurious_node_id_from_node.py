"""drop spurious node_id column from node table if present

Some databases contain a `node_id` column on the `node` table from an older
schema iteration. The current Node model uses `id` (UUID) as the primary key;
`node_id` is not referenced by the model and causes an IntegrityError on every
INSERT because the column is NOT NULL with no default.

Root cause: the node table was created on some databases before the a1b2c3d4e5f6
migration (which guards CREATE TABLE with `has_table`), leaving a legacy `node_id`
column that SQLModel never populates.

Safe to drop: no FK in any other table references node.node_id — all foreign keys
reference node.id (the UUID primary key).

If `node_id` happens to be the primary key on the affected DB, this migration also
ensures `id` becomes the primary key before dropping `node_id`.

Revision ID: p18_001_drop_spurious_node_id
Revises: p17_001_handoffpair_table
Create Date: 2026-04-16
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect, text

revision = "p18_001_drop_spurious_node_id"
down_revision = "p17_001_handoffpair_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)

    if not inspector.has_table("node"):
        return

    existing_columns = {col["name"] for col in inspector.get_columns("node")}
    if "node_id" not in existing_columns:
        # Already clean — nothing to do.
        return

    # Determine whether node_id is part of the primary key.
    pk_info = inspector.get_pk_constraint("node")
    pk_columns = set(pk_info.get("constrained_columns", []))
    node_id_is_pk = "node_id" in pk_columns

    if node_id_is_pk:
        # Promote `id` to be the primary key before dropping the old PK column.
        pk_name = pk_info.get("name") or "node_pkey"

        # Drop existing PK constraint.
        op.execute(f'ALTER TABLE node DROP CONSTRAINT IF EXISTS "{pk_name}"')

        # Add PK constraint on `id` (the UUID column) if not already present.
        id_is_pk = "id" in pk_columns
        if not id_is_pk and "id" in existing_columns:
            op.create_primary_key("node_pkey", "node", ["id"])

    # Drop the spurious column.
    op.drop_column("node", "node_id")


def downgrade() -> None:
    # This migration cleans up a schema inconsistency that was never intentional.
    # Restoring node_id would re-introduce the bug, so downgrade is intentionally
    # a no-op.
    pass
