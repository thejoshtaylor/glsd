"""add user_id to node if missing

Adds the user_id column to the node table for databases where node was
created before the a1b2c3d4e5f6 migration (which skips table creation if
the table already exists, leaving user_id absent from pre-existing node tables).

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-04-10 00:00:00.000000

"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "e3f4a5b6c7d8"
down_revision = "d2e3f4a5b6c7"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    existing_columns = [col["name"] for col in inspect(conn).get_columns("node")]

    if "user_id" not in existing_columns:
        # Add as nullable — existing rows cannot be backfilled (raw token not stored).
        # Nodes without user_id will not appear in user queries and must re-register.
        op.add_column(
            "node",
            sa.Column("user_id", sa.Uuid(), nullable=True),
        )
        op.create_foreign_key(
            "fk_node_user_id_user",
            "node",
            "user",
            ["user_id"],
            ["id"],
        )
        op.create_index(op.f("ix_node_user_id"), "node", ["user_id"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_node_user_id"), table_name="node")
    op.drop_constraint("fk_node_user_id_user", "node", type_="foreignkey")
    op.drop_column("node", "user_id")
