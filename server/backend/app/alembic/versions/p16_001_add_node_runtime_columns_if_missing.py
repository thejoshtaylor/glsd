"""add node runtime columns if missing

Adds columns that a1b2c3d4e5f6 includes in CREATE TABLE but skips when the
node table already exists. Databases that pre-dated that migration will be
missing is_revoked, connected_at, disconnected_at, last_seen, os, arch,
daemon_version, and created_at.

Pattern mirrors p15_001_add_token_hash_to_node_if_missing.py.

Revision ID: p16_001_node_runtime_cols
Revises: p15_001_token_hash
Create Date: 2026-04-15
"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op
from sqlalchemy import inspect

revision = "p16_001_node_runtime_cols"
down_revision = "p15_001_token_hash"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    existing_columns = {col["name"] for col in inspect(conn).get_columns("node")}

    if "is_revoked" not in existing_columns:
        op.add_column(
            "node",
            sa.Column(
                "is_revoked",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            ),
        )

    if "connected_at" not in existing_columns:
        op.add_column(
            "node",
            sa.Column("connected_at", sa.DateTime(timezone=True), nullable=True),
        )

    if "disconnected_at" not in existing_columns:
        op.add_column(
            "node",
            sa.Column("disconnected_at", sa.DateTime(timezone=True), nullable=True),
        )

    if "last_seen" not in existing_columns:
        op.add_column(
            "node",
            sa.Column("last_seen", sa.DateTime(timezone=True), nullable=True),
        )

    if "os" not in existing_columns:
        op.add_column(
            "node",
            sa.Column(
                "os",
                sqlmodel.sql.sqltypes.AutoString(length=50),
                nullable=True,
            ),
        )

    if "arch" not in existing_columns:
        op.add_column(
            "node",
            sa.Column(
                "arch",
                sqlmodel.sql.sqltypes.AutoString(length=50),
                nullable=True,
            ),
        )

    if "daemon_version" not in existing_columns:
        op.add_column(
            "node",
            sa.Column(
                "daemon_version",
                sqlmodel.sql.sqltypes.AutoString(length=50),
                nullable=True,
            ),
        )

    if "created_at" not in existing_columns:
        op.add_column(
            "node",
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    conn = op.get_bind()
    existing_columns = {col["name"] for col in inspect(conn).get_columns("node")}

    for col in [
        "is_revoked",
        "connected_at",
        "disconnected_at",
        "last_seen",
        "os",
        "arch",
        "daemon_version",
        "created_at",
    ]:
        if col in existing_columns:
            op.drop_column("node", col)
