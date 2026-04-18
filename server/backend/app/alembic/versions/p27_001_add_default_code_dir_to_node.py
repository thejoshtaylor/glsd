"""add default_code_dir to node

Revision ID: p27_001_node_default_code_dir
Revises: p26_001_github_app_inst_uid
Create Date: 2026-04-18
"""

import sqlalchemy as sa
from alembic import op

revision = "p27_001_node_default_code_dir"
down_revision = "p26_001_github_app_inst_uid"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "node",
        sa.Column("default_code_dir", sa.String(length=1024), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("node", "default_code_dir")
