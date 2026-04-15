"""add token_hash to node if missing

Adds the token_hash column to the node table for databases where node was
created before the a1b2c3d4e5f6 migration (which skips table creation if
the table already exists, leaving token_hash absent from pre-existing node tables).

Revision ID: p15_001_token_hash
Revises: p11_1_001
Create Date: 2026-04-15
"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "p15_001_token_hash"
down_revision = "p11_1_001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    existing_columns = [col["name"] for col in inspect(conn).get_columns("node")]

    if "token_hash" not in existing_columns:
        # Add as nullable first so existing rows don't violate NOT NULL.
        # Existing nodes without token_hash must re-register (raw token not stored).
        op.add_column(
            "node",
            sa.Column(
                "token_hash",
                sqlmodel.sql.sqltypes.AutoString(),
                nullable=True,
            ),
        )
        # Backfill existing rows with a placeholder hash so NOT NULL can be applied.
        # These nodes will need to re-pair since the original raw token is not stored.
        op.execute(
            "UPDATE node SET token_hash = 'REQUIRES_RE_REGISTRATION' WHERE token_hash IS NULL"
        )
        op.alter_column("node", "token_hash", nullable=False)


def downgrade() -> None:
    op.drop_column("node", "token_hash")
