"""remove node_id/cwd from project; add git config branch columns

Revision ID: p30_001_remove_project_node_cwd
Revises: p29_001_add_project_node
Create Date: 2026-04-20
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "p30_001_remove_project_node_cwd"
down_revision = "p29_001_add_project_node"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)

    project_columns = [col["name"] for col in inspector.get_columns("project")]
    if "node_id" in project_columns:
        # Drop FK constraint before dropping column
        fk_names = [fk["name"] for fk in inspector.get_foreign_keys("project")]
        for fk_name in fk_names:
            if fk_name and "node" in fk_name.lower():
                op.drop_constraint(fk_name, "project", type_="foreignkey")
        op.drop_column("project", "node_id")

    if "cwd" in project_columns:
        op.drop_column("project", "cwd")

    git_config_columns = [col["name"] for col in inspector.get_columns("project_git_config")]
    if "pull_from_branch" not in git_config_columns:
        op.add_column(
            "project_git_config",
            sa.Column("pull_from_branch", sa.String(length=255), nullable=True),
        )
    if "push_to_branch" not in git_config_columns:
        op.add_column(
            "project_git_config",
            sa.Column("push_to_branch", sa.String(length=255), nullable=True),
        )
    if "merge_mode" not in git_config_columns:
        op.add_column(
            "project_git_config",
            sa.Column(
                "merge_mode",
                sa.String(length=50),
                nullable=False,
                server_default="auto_pr",
            ),
        )
    if "pr_target_branch" not in git_config_columns:
        op.add_column(
            "project_git_config",
            sa.Column("pr_target_branch", sa.String(length=255), nullable=True),
        )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)

    git_config_columns = [col["name"] for col in inspector.get_columns("project_git_config")]
    for col in ("pr_target_branch", "merge_mode", "push_to_branch", "pull_from_branch"):
        if col in git_config_columns:
            op.drop_column("project_git_config", col)

    project_columns = [col["name"] for col in inspector.get_columns("project")]
    if "cwd" not in project_columns:
        op.add_column(
            "project",
            sa.Column("cwd", sa.String(length=4096), nullable=True),
        )
    if "node_id" not in project_columns:
        op.add_column("project", sa.Column("node_id", sa.Uuid(), nullable=True))
        op.create_foreign_key(
            "fk_project_node_id_node", "project", "node", ["node_id"], ["id"]
        )
