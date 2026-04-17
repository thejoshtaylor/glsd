"""add trigger, actionchain, action, trigger_execution tables

Revision ID: p23_001_add_trigger_tables
Revises: p21_001_drop_bearer_token_hash
Create Date: 2026-04-16
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect
from sqlalchemy.dialects.postgresql import JSONB

revision = "p23_001_add_trigger_tables"
down_revision = "p21_001_drop_bearer_token_hash"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)

    if not inspector.has_table("trigger"):
        op.create_table(
            "trigger",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("project_id", sa.UUID(), nullable=False),
            sa.Column("name", sa.VARCHAR(255), nullable=False),
            sa.Column("event_type", sa.VARCHAR(50), nullable=False),
            sa.Column("conditions", JSONB(), nullable=True),
            sa.Column("enabled", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column("cooldown_seconds", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["project_id"], ["project.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_trigger_project_id", "trigger", ["project_id"])

    if not inspector.has_table("actionchain"):
        op.create_table(
            "actionchain",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("trigger_id", sa.UUID(), nullable=False),
            sa.Column("name", sa.VARCHAR(255), nullable=False),
            sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["trigger_id"], ["trigger.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_actionchain_trigger_id", "actionchain", ["trigger_id"])

    if not inspector.has_table("action"):
        op.create_table(
            "action",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("chain_id", sa.UUID(), nullable=False),
            sa.Column("action_type", sa.VARCHAR(50), nullable=False),
            sa.Column("config", JSONB(), nullable=True),
            sa.Column("sequence_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["chain_id"], ["actionchain.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_action_chain_id", "action", ["chain_id"])

    if not inspector.has_table("trigger_execution"):
        op.create_table(
            "trigger_execution",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("trigger_id", sa.UUID(), nullable=False),
            sa.Column("fired_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("status", sa.VARCHAR(20), nullable=False, server_default="PENDING"),
            sa.Column("chain_results", JSONB(), nullable=True),
            sa.Column("event_payload", JSONB(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["trigger_id"], ["trigger.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_trigger_execution_trigger_id", "trigger_execution", ["trigger_id"])


def downgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)

    if inspector.has_table("trigger_execution"):
        op.drop_index("ix_trigger_execution_trigger_id", table_name="trigger_execution")
        op.drop_table("trigger_execution")

    if inspector.has_table("action"):
        op.drop_index("ix_action_chain_id", table_name="action")
        op.drop_table("action")

    if inspector.has_table("actionchain"):
        op.drop_index("ix_actionchain_trigger_id", table_name="actionchain")
        op.drop_table("actionchain")

    if inspector.has_table("trigger"):
        op.drop_index("ix_trigger_project_id", table_name="trigger")
        op.drop_table("trigger")
