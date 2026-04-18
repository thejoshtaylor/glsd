"""add github_app_installation table

Revision ID: p25_001_github_app_install
Revises: p24_001_add_last_fired_at
Create Date: 2026-04-17
"""

import sqlalchemy as sa
from alembic import op

revision = "p25_001_github_app_install"
down_revision = "p24_001_add_last_fired_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "github_app_installation",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("installation_id", sa.Integer(), nullable=False),
        sa.Column("account_login", sa.String(), nullable=False),
        sa.Column("account_type", sa.String(), nullable=False),
        sa.Column("app_id", sa.Integer(), nullable=False),
        sa.Column("encrypted_token", sa.Text(), nullable=False),
        sa.Column("token_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("installation_id"),
    )
    op.create_index(
        op.f("ix_github_app_installation_installation_id"),
        "github_app_installation",
        ["installation_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_github_app_installation_installation_id"),
        table_name="github_app_installation",
    )
    op.drop_table("github_app_installation")
