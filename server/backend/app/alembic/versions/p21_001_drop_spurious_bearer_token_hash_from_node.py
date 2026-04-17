"""drop spurious bearer_token_hash column from node table if present

Some databases contain a `bearer_token_hash` column on the `node` table from an
older schema iteration. The current Node model uses `token_hash` for the pairing
token hash; `bearer_token_hash` is not referenced by the model and causes an
IntegrityError on every INSERT because the column is NOT NULL with no default.

Root cause: same schema-drift pattern as the spurious `node_id` column fixed in
p18_001 — the node table was created on some databases before the canonical
migrations ran, leaving legacy columns that SQLModel never populates.

Safe to drop: no FK in any other table references node.bearer_token_hash.

Revision ID: p21_001_drop_bearer_token_hash
Revises: p20_001_add_status_to_node
Create Date: 2026-04-17
"""

from alembic import op
from sqlalchemy import inspect

revision = "p21_001_drop_bearer_token_hash"
down_revision = "p20_001_add_status_to_node"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)

    if not inspector.has_table("node"):
        return

    existing_columns = {col["name"] for col in inspector.get_columns("node")}
    if "bearer_token_hash" not in existing_columns:
        return

    op.drop_column("node", "bearer_token_hash")


def downgrade() -> None:
    # This migration cleans up a schema inconsistency that was never intentional.
    # Restoring bearer_token_hash would re-introduce the bug, so downgrade is a no-op.
    pass
