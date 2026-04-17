"""add last_fired_at to trigger table

Revision ID: p24_001_add_last_fired_at_to_trigger
Revises: p23_001_add_trigger_tables
Create Date: 2026-04-17
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "p24_001_add_last_fired_at_to_trigger"
down_revision = "p23_001_add_trigger_tables"
branch_labels = None
depends_on = None


def _has_column(inspector: inspect, table: str, column: str) -> bool:
    return any(c["name"] == column for c in inspector.get_columns(table))


def upgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)

    if not _has_column(inspector, "trigger", "last_fired_at"):
        op.add_column(
            "trigger",
            sa.Column("last_fired_at", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)

    if _has_column(inspector, "trigger", "last_fired_at"):
        op.drop_column("trigger", "last_fired_at")
