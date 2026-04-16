"""add handoffpair table

Revision ID: p17_001_handoffpair_table
Revises: p16_001_node_runtime_cols
Create Date: 2026-04-15
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "p17_001_handoffpair_table"
down_revision = "p16_001_node_runtime_cols"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = inspect(op.get_bind())
    if not inspector.has_table("handoffpair"):
        op.create_table(
            "handoffpair",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("user_id", sa.UUID(), nullable=False),
            sa.Column("node_a_id", sa.UUID(), nullable=False),
            sa.Column("node_b_id", sa.UUID(), nullable=False),
            sa.Column("schedule", sa.VARCHAR(), nullable=False),
            sa.Column("branch_prefix", sa.VARCHAR(), nullable=False, server_default="gsd/handoff"),
            sa.Column("active_node_id", sa.UUID(), nullable=True),
            sa.Column("last_handoff_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_branch_ref", sa.VARCHAR(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
            sa.ForeignKeyConstraint(["node_a_id"], ["node.id"]),
            sa.ForeignKeyConstraint(["node_b_id"], ["node.id"]),
            sa.ForeignKeyConstraint(["active_node_id"], ["node.id"]),
        )
        op.create_index("ix_handoffpair_user_id", "handoffpair", ["user_id"])


def downgrade() -> None:
    inspector = inspect(op.get_bind())
    if inspector.has_table("handoffpair"):
        op.drop_index("ix_handoffpair_user_id", table_name="handoffpair")
        op.drop_table("handoffpair")
