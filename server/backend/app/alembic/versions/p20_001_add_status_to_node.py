"""add status column to node table

The Node model now defines a `status` field (default="paired") to track node
lifecycle state. Some databases already have this column (NOT NULL, no default)
from a prior schema change; others don't have it at all.

This migration reconciles both cases:
  1. If `status` already exists: backfill any NULL rows to "paired".
  2. If `status` does not exist: add the column as nullable, backfill, then
     apply NOT NULL.

Revision ID: p20_001_add_status_to_node
Revises: p19_001_add_teams
Create Date: 2026-04-17
"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op
from sqlalchemy import inspect, text

revision = "p20_001_add_status_to_node"
down_revision = "p19_001_add_teams"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)
    node_columns = {col["name"] for col in inspector.get_columns("node")}

    if "status" not in node_columns:
        op.add_column(
            "node",
            sa.Column(
                "status",
                sqlmodel.sql.sqltypes.AutoString(length=50),
                nullable=True,
            ),
        )

    # Backfill any rows without a status value.
    conn.execute(
        text("UPDATE node SET status = 'paired' WHERE status IS NULL")
    )

    if "status" not in node_columns:
        op.alter_column("node", "status", nullable=False)


def downgrade() -> None:
    op.drop_column("node", "status")
