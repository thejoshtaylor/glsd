"""add push_subscription table

Revision ID: p14_001_push_sub
Revises: a5b6c7d8e9f0
Create Date: 2026-04-13
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "p14_001_push_sub"
down_revision = "a5b6c7d8e9f0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "push_subscription",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("endpoint", sa.String(length=2048), nullable=False),
        sa.Column("p256dh", sa.String(length=512), nullable=False),
        sa.Column("auth", sa.String(length=512), nullable=False),
        sa.Column("notify_permissions", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("notify_completions", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
        if_not_exists=True,
    )
    op.create_index(op.f("ix_push_subscription_user_id"), "push_subscription", ["user_id"], if_not_exists=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_push_subscription_user_id"), table_name="push_subscription")
    op.drop_table("push_subscription")
