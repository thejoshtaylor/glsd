"""Add clone_status to project_node and create adminsetting table.

clone_status tracks the git clone lifecycle for each project-node relationship:
  null -> cloning -> ready | failed

adminsetting is a key-value singleton for server-wide admin config.
Sensitive values (e.g. openai_api_key) are stored Fernet-encrypted.

Revision ID: p32_001_add_clone_status_and_admin_settings
Revises: p31_001_drop_work_dir
Create Date: 2026-04-21
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "p32_001_clone_status_admin"
down_revision = "p31_001_drop_work_dir"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)

    # Add clone_status to project_node (idempotent via inspector check)
    project_node_cols = [c["name"] for c in inspector.get_columns("project_node")]
    if "clone_status" not in project_node_cols:
        op.add_column(
            "project_node",
            sa.Column("clone_status", sa.String(length=50), nullable=True),
        )

    # Create adminsetting table if it doesn't exist
    existing_tables = inspector.get_table_names()
    if "adminsetting" not in existing_tables:
        op.create_table(
            "adminsetting",
            sa.Column("key", sa.String(length=255), primary_key=True),
            sa.Column("encrypted_value", sa.Text(), nullable=True),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=True,
            ),
        )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)

    existing_tables = inspector.get_table_names()
    if "adminsetting" in existing_tables:
        op.drop_table("adminsetting")

    project_node_cols = [c["name"] for c in inspector.get_columns("project_node")]
    if "clone_status" in project_node_cols:
        op.drop_column("project_node", "clone_status")
