"""phase11 foundation migrations

Add all new tables and columns needed for v1.1 phases:
- user.email_verified (Boolean, server_default=true so existing v1.0 users unaffected)
- user.email_verification_token (String nullable)
- user.email_verification_sent_at (DateTime nullable)
- push_subscription table (for Phase 14 Web Push)
- usage_record table (for Phase 12 Usage Tracking)

Uses inspector-based existence checks throughout so this migration is safe
to run on fresh installs (where columns/tables don't exist) and on v1.0
upgrades (where some may already be present via prior migrations).

Revision ID: b1c2d3e4f5a6
Revises: a5b6c7d8e9f0
Create Date: 2026-04-11 00:00:00.000000

"""
import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "b1c2d3e4f5a6"
down_revision = "a5b6c7d8e9f0"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = inspect(conn)
    existing_tables = inspector.get_table_names()

    # --- User table: add email verification columns ---
    user_columns = [col["name"] for col in inspector.get_columns("user")]

    if "email_verified" not in user_columns:
        op.add_column(
            "user",
            sa.Column(
                "email_verified",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("true"),  # existing v1.0 users treated as verified (AUTH-08)
            ),
        )

    if "email_verification_token" not in user_columns:
        op.add_column(
            "user",
            sa.Column(
                "email_verification_token",
                sqlmodel.sql.sqltypes.AutoString(length=255),
                nullable=True,
            ),
        )

    if "email_verification_sent_at" not in user_columns:
        op.add_column(
            "user",
            sa.Column(
                "email_verification_sent_at",
                sa.DateTime(timezone=True),
                nullable=True,
            ),
        )

    # --- push_subscription table (Phase 14) ---
    if "push_subscription" not in existing_tables:
        op.create_table(
            "push_subscription",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("user_id", sa.Uuid(), nullable=False),
            sa.Column(
                "endpoint",
                sqlmodel.sql.sqltypes.AutoString(length=2048),
                nullable=False,
            ),
            sa.Column(
                "p256dh",
                sqlmodel.sql.sqltypes.AutoString(length=255),
                nullable=False,
            ),
            sa.Column(
                "auth",
                sqlmodel.sql.sqltypes.AutoString(length=255),
                nullable=False,
            ),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            op.f("ix_push_subscription_user_id"),
            "push_subscription",
            ["user_id"],
            unique=False,
        )

    # --- usage_record table (Phase 12) ---
    if "usage_record" not in existing_tables:
        op.create_table(
            "usage_record",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("session_id", sa.Uuid(), nullable=False),
            sa.Column("user_id", sa.Uuid(), nullable=False),
            sa.Column(
                "input_tokens",
                sa.Integer(),
                nullable=False,
                server_default=sa.text("0"),
            ),
            sa.Column(
                "output_tokens",
                sa.Integer(),
                nullable=False,
                server_default=sa.text("0"),
            ),
            sa.Column(
                "cost_usd",
                sa.Numeric(precision=10, scale=6),
                nullable=False,
                server_default=sa.text("0"),
            ),
            sa.Column(
                "duration_ms",
                sa.Integer(),
                nullable=False,
                server_default=sa.text("0"),
            ),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["session_id"], ["session.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            op.f("ix_usage_record_session_id"),
            "usage_record",
            ["session_id"],
            unique=False,
        )
        op.create_index(
            op.f("ix_usage_record_user_id"),
            "usage_record",
            ["user_id"],
            unique=False,
        )


def downgrade():
    conn = op.get_bind()
    inspector = inspect(conn)
    existing_tables = inspector.get_table_names()
    user_columns = [col["name"] for col in inspector.get_columns("user")]

    # Drop usage_record table
    if "usage_record" in existing_tables:
        usage_indexes = [idx["name"] for idx in inspector.get_indexes("usage_record")]
        if "ix_usage_record_user_id" in usage_indexes:
            op.drop_index(op.f("ix_usage_record_user_id"), table_name="usage_record")
        if "ix_usage_record_session_id" in usage_indexes:
            op.drop_index(op.f("ix_usage_record_session_id"), table_name="usage_record")
        op.drop_table("usage_record")

    # Drop push_subscription table
    if "push_subscription" in existing_tables:
        push_indexes = [idx["name"] for idx in inspector.get_indexes("push_subscription")]
        if "ix_push_subscription_user_id" in push_indexes:
            op.drop_index(
                op.f("ix_push_subscription_user_id"), table_name="push_subscription"
            )
        op.drop_table("push_subscription")

    # Drop user columns (reverse order)
    if "email_verification_sent_at" in user_columns:
        op.drop_column("user", "email_verification_sent_at")
    if "email_verification_token" in user_columns:
        op.drop_column("user", "email_verification_token")
    if "email_verified" in user_columns:
        op.drop_column("user", "email_verified")
