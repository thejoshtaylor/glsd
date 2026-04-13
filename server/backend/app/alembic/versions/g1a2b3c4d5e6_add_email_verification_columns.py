"""Add email verification columns to user table

Revision ID: g1a2b3c4d5e6
Revises: p14_001_push_sub
Create Date: 2026-04-13
"""

import sqlalchemy as sa
from alembic import op

revision = "g1a2b3c4d5e6"
down_revision = "p14_001_push_sub"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user",
        sa.Column(
            "email_verified", sa.Boolean(), server_default="true", nullable=False
        ),
    )
    op.add_column(
        "user",
        sa.Column("email_verification_token", sa.String(255), nullable=True),
    )
    op.add_column(
        "user",
        sa.Column(
            "email_verification_sent_at", sa.DateTime(timezone=True), nullable=True
        ),
    )


def downgrade() -> None:
    op.drop_column("user", "email_verification_sent_at")
    op.drop_column("user", "email_verification_token")
    op.drop_column("user", "email_verified")
