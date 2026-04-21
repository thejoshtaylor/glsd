"""drop work_dir from project if present

work_dir is a stale column that was added directly to some databases outside
of the migration chain. The canonical path storage is ProjectNode.local_path.
Dropping it unblocks project creation (INSERT was failing with NOT NULL violation).

Revision ID: p31_001_drop_work_dir_from_project
Revises: p30_001_remove_project_node_cwd
Create Date: 2026-04-21
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "p31_001_drop_work_dir_from_project"
down_revision = "p30_001_remove_project_node_cwd"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)
    project_columns = [col["name"] for col in inspector.get_columns("project")]
    if "work_dir" in project_columns:
        op.drop_column("project", "work_dir")


def downgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)
    project_columns = [col["name"] for col in inspector.get_columns("project")]
    if "work_dir" not in project_columns:
        op.add_column(
            "project",
            sa.Column("work_dir", sa.String(length=4096), nullable=True),
        )
