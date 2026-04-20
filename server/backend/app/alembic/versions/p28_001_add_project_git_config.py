"""add project_git_config table

Revision ID: p28_001_project_git_config
Revises: p27_001_node_default_code_dir
Create Date: 2026-04-20
"""

import sqlalchemy as sa
from alembic import op

revision = "p28_001_project_git_config"
down_revision = "p27_001_node_default_code_dir"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_git_config",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("repo_url", sa.String(length=2048), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["project.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id"),
    )
    op.create_index("ix_project_git_config_project_id", "project_git_config", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_project_git_config_project_id", table_name="project_git_config")
    op.drop_table("project_git_config")
