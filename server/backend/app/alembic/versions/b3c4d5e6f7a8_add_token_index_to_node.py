"""add token_index to node for O(1) token lookup

Revision ID: b3c4d5e6f7a8
Revises: a1b2c3d4e5f6
Create Date: 2026-04-09 00:00:00.000000

"""
import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = "b3c4d5e6f7a8"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade():
    # Add token_index column: BLAKE2b hex digest (32 chars for digest_size=16)
    # nullable=True initially to allow backfill on existing rows; then set NOT NULL.
    op.add_column(
        "node",
        sa.Column(
            "token_index",
            sqlmodel.sql.sqltypes.AutoString(length=64),
            nullable=True,
        ),
    )
    # Existing rows in production would need a data migration to populate token_index.
    # Since the raw token is not stored, existing node tokens must be re-issued after
    # this migration. Set a placeholder so the NOT NULL constraint can be applied.
    op.execute("UPDATE node SET token_index = encode(gen_random_bytes(16), 'hex') WHERE token_index IS NULL")
    op.alter_column("node", "token_index", nullable=False)
    op.create_index(op.f("ix_node_token_index"), "node", ["token_index"], unique=True)


def downgrade():
    op.drop_index(op.f("ix_node_token_index"), table_name="node")
    op.drop_column("node", "token_index")
