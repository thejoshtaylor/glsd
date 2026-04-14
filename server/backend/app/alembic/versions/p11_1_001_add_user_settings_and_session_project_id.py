"""add user_settings table and session.project_id FK

Revision ID: p11_1_001
Revises: a5b6c7d8e9f0
Create Date: 2026-04-13
"""
from alembic import op
import sqlalchemy as sa

revision = "p11_1_001"
down_revision = "a5b6c7d8e9f0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_settings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("theme", sa.String(length=50), nullable=False, server_default="system"),
        sa.Column("accent_color", sa.String(length=50), nullable=False, server_default="default"),
        sa.Column("ui_density", sa.String(length=20), nullable=False, server_default="normal"),
        sa.Column("font_size_scale", sa.String(length=20), nullable=False, server_default="medium"),
        sa.Column("font_family", sa.String(length=100), nullable=False, server_default="default"),
        sa.Column("notifications_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("notify_on_complete", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("notify_on_error", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("notify_cost_threshold", sa.Float(), nullable=True),
        sa.Column("notify_on_phase_complete", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("notify_on_cost_warning", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("default_cost_limit", sa.Float(), nullable=False, server_default=sa.text("0.0")),
        sa.Column("debug_logging", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("user_mode", sa.String(length=20), nullable=False, server_default="expert"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_user_settings_user_id"), "user_settings", ["user_id"], unique=True)

    # Add project_id FK to session table
    op.add_column("session", sa.Column("project_id", sa.Uuid(), nullable=True))
    op.create_index(op.f("ix_session_project_id"), "session", ["project_id"], unique=False)
    op.create_foreign_key("fk_session_project_id", "session", "project", ["project_id"], ["id"])


def downgrade() -> None:
    op.drop_constraint("fk_session_project_id", "session", type_="foreignkey")
    op.drop_index(op.f("ix_session_project_id"), table_name="session")
    op.drop_column("session", "project_id")
    op.drop_index(op.f("ix_user_settings_user_id"), table_name="user_settings")
    op.drop_table("user_settings")
