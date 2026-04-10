"""add machine_id to node if missing

Adds the machine_id column to the node table for databases where node was
created before the a1b2c3d4e5f6 migration (which skips table creation if
the table already exists, leaving machine_id absent from pre-existing node tables).

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
Create Date: 2026-04-10 00:00:00.000000

"""
import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "f4a5b6c7d8e9"
down_revision = "e3f4a5b6c7d8"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    existing_columns = [col["name"] for col in inspect(conn).get_columns("node")]

    if "machine_id" not in existing_columns:
        op.add_column(
            "node",
            sa.Column(
                "machine_id",
                sqlmodel.sql.sqltypes.AutoString(length=255),
                nullable=True,
            ),
        )
        op.create_index(op.f("ix_node_machine_id"), "node", ["machine_id"], unique=True)


def downgrade():
    op.drop_index(op.f("ix_node_machine_id"), table_name="node")
    op.drop_column("node", "machine_id")
