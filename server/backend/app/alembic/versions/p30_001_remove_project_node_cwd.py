"""remove node_id/cwd from project; add git config columns

Revision ID: p30_001_remove_project_node_cwd
Revises: p29_001_add_project_node
Create Date: 2026-04-20
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.engine.reflection import Inspector

revision = "p30_001_remove_project_node_cwd"
down_revision = "p29_001_add_project_node"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)

    # Drop node_id FK constraint + column from project
    project_cols = [c["name"] for c in inspector.get_columns("project")]
    if "node_id" in project_cols:
        fks = inspector.get_foreign_keys("project")
        for fk in fks:
            if "node_id" in fk.get("constrained_columns", []):
                op.drop_constraint(fk["name"], "project", type_="foreignkey")
        op.drop_column("project", "node_id")

    if "cwd" in project_cols:
        op.drop_column("project", "cwd")

    # Add new columns to project_git_config if absent
    pgc_cols = [c["name"] for c in inspector.get_columns("project_git_config")]
    if "pull_from_branch" not in pgc_cols:
        op.add_column("project_git_config", sa.Column("pull_from_branch", sa.String(255), nullable=True))
    if "push_to_branch" not in pgc_cols:
        op.add_column("project_git_config", sa.Column("push_to_branch", sa.String(255), nullable=True))
    if "merge_mode" not in pgc_cols:
        op.add_column("project_git_config", sa.Column("merge_mode", sa.String(50), nullable=False, server_default="auto_pr"))
    if "pr_target_branch" not in pgc_cols:
        op.add_column("project_git_config", sa.Column("pr_target_branch", sa.String(255), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)

    # Remove git config columns
    pgc_cols = [c["name"] for c in inspector.get_columns("project_git_config")]
    for col in ("pull_from_branch", "push_to_branch", "merge_mode", "pr_target_branch"):
        if col in pgc_cols:
            op.drop_column("project_git_config", col)

    # Re-add node_id and cwd to project
    project_cols = [c["name"] for c in inspector.get_columns("project")]
    if "node_id" not in project_cols:
        op.add_column("project", sa.Column("node_id", sa.Uuid(), nullable=True))
    if "cwd" not in project_cols:
        op.add_column("project", sa.Column("cwd", sa.String(4096), nullable=True))
