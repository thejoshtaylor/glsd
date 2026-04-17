"""add user_id to github_app_installation

Revision ID: p26_001_add_user_id_to_github_app_installation
Revises: p25_001_add_github_app_installation
Create Date: 2026-04-17
"""

import sqlalchemy as sa
from alembic import op

revision = "p26_001_add_user_id_to_github_app_installation"
down_revision = "p25_001_add_github_app_installation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "github_app_installation",
        sa.Column("user_id", sa.Uuid(), nullable=True),
    )
    op.create_index(
        "ix_github_app_installation_user_id",
        "github_app_installation",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_github_app_installation_user_id",
        table_name="github_app_installation",
    )
    op.drop_column("github_app_installation", "user_id")
