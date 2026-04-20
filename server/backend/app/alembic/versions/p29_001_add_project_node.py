"""add project_node table

Revision ID: p29_001_add_project_node
Revises: p28_001_project_git_config
Create Date: 2026-04-20
"""

import sqlalchemy as sa
from alembic import op

revision = "p29_001_add_project_node"
down_revision = "p28_001_project_git_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_node",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("node_id", sa.Uuid(), nullable=False),
        sa.Column("local_path", sa.String(length=4096), nullable=False),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_session_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["project.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["node_id"], ["node.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_project_node_project_id", "project_node", ["project_id"])
    op.create_index("ix_project_node_node_id", "project_node", ["node_id"])


def downgrade() -> None:
    op.drop_index("ix_project_node_node_id", table_name="project_node")
    op.drop_index("ix_project_node_project_id", table_name="project_node")
    op.drop_table("project_node")
