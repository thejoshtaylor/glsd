"""Add usage_record table

Revision ID: p12_001_usage_record
Revises: g1a2b3c4d5e6
Create Date: 2026-04-13

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "p12_001_usage_record"
down_revision = "g1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "usage_record",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("input_tokens", sa.Integer(), server_default="0", nullable=False),
        sa.Column("output_tokens", sa.Integer(), server_default="0", nullable=False),
        sa.Column("cost_usd", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("duration_ms", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["session_id"], ["session.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_usage_record_session_id"), "usage_record", ["session_id"], unique=False
    )
    op.create_index(
        op.f("ix_usage_record_user_id"), "usage_record", ["user_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_usage_record_user_id"), table_name="usage_record")
    op.drop_index(op.f("ix_usage_record_session_id"), table_name="usage_record")
    op.drop_table("usage_record")
