"""add node session and session_event tables

Revision ID: a1b2c3d4e5f6
Revises: fe56fa70289e
Create Date: 2026-04-10 00:12:00.000000

"""
import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "a1b2c3d4e5f6"
down_revision = "fe56fa70289e"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "node",
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "machine_id", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True
        ),
        sa.Column(
            "token_hash", sqlmodel.sql.sqltypes.AutoString(), nullable=False
        ),
        sa.Column("is_revoked", sa.Boolean(), nullable=False),
        sa.Column("connected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("disconnected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=True),
        sa.Column("os", sqlmodel.sql.sqltypes.AutoString(length=50), nullable=True),
        sa.Column("arch", sqlmodel.sql.sqltypes.AutoString(length=50), nullable=True),
        sa.Column(
            "daemon_version",
            sqlmodel.sql.sqltypes.AutoString(length=50),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_node_machine_id"), "node", ["machine_id"], unique=True)
    op.create_index(op.f("ix_node_user_id"), "node", ["user_id"], unique=False)

    op.create_table(
        "session",
        sa.Column("cwd", sqlmodel.sql.sqltypes.AutoString(length=4096), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("node_id", sa.Uuid(), nullable=False),
        sa.Column(
            "status", sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False
        ),
        sa.Column(
            "claude_session_id",
            sqlmodel.sql.sqltypes.AutoString(length=255),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["node_id"], ["node.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_session_node_id"), "session", ["node_id"], unique=False)
    op.create_index(op.f("ix_session_user_id"), "session", ["user_id"], unique=False)

    op.create_table(
        "session_event",
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("sequence_number", sa.Integer(), nullable=False),
        sa.Column(
            "event_type", sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False
        ),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["session_id"], ["session.id"]),
        sa.PrimaryKeyConstraint("session_id", "sequence_number"),
    )
    op.create_index(
        op.f("ix_session_event_event_type"),
        "session_event",
        ["event_type"],
        unique=False,
    )


def downgrade():
    op.drop_index(op.f("ix_session_event_event_type"), table_name="session_event")
    op.drop_table("session_event")
    op.drop_index(op.f("ix_session_user_id"), table_name="session")
    op.drop_index(op.f("ix_session_node_id"), table_name="session")
    op.drop_table("session")
    op.drop_index(op.f("ix_node_user_id"), table_name="node")
    op.drop_index(op.f("ix_node_machine_id"), table_name="node")
    op.drop_table("node")
