"""add team table and personal team per user; wire node.team_id

The `node` table already has a `team_id NOT NULL` column on some databases
from a prior schema change that never landed a matching migration. This
migration reconciles that gap:

  1. Creates the `team` table if it does not exist.
  2. If `node.team_id` already exists as NOT NULL, create a personal team for
     every distinct user that owns at least one node, then backfill each node's
     team_id to its owner's personal team.
  3. If `node.team_id` does not yet exist, add it as nullable, backfill, then
     add the NOT NULL constraint and the FK index.
  4. Creates a personal team for every user that doesn't already have one, so
     new nodes can always find their team.

Revision ID: p19_001_add_teams
Revises: p18_001_drop_spurious_node_id
Create Date: 2026-04-17
"""

import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect, text

revision = "p19_001_add_teams"
down_revision = "p18_001_drop_spurious_node_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)

    # ------------------------------------------------------------------
    # 1. Create team table
    # ------------------------------------------------------------------
    if not inspector.has_table("team"):
        op.create_table(
            "team",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("owner_id", sa.UUID(), nullable=False),
            sa.Column("name", sa.VARCHAR(255), nullable=False),
            sa.Column("is_personal", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(["owner_id"], ["user.id"]),
        )
        op.create_index("ix_team_owner_id", "team", ["owner_id"])

    # ------------------------------------------------------------------
    # 2. Create a personal team for every existing user who doesn't have one
    # ------------------------------------------------------------------
    conn.execute(
        text("""
            INSERT INTO team (id, owner_id, name, is_personal, created_at)
            SELECT
                gen_random_uuid(),
                u.id,
                'Personal',
                true,
                NOW()
            FROM "user" u
            WHERE NOT EXISTS (
                SELECT 1 FROM team t
                WHERE t.owner_id = u.id AND t.is_personal = true
            )
        """)
    )

    # ------------------------------------------------------------------
    # 3. Handle node.team_id
    # ------------------------------------------------------------------
    node_columns = {col["name"] for col in inspector.get_columns("node")}

    if "team_id" not in node_columns:
        # Column doesn't exist yet — add nullable, backfill, then constrain.
        op.add_column("node", sa.Column("team_id", sa.UUID(), nullable=True))

    # Backfill: assign each node to its owner's personal team.
    conn.execute(
        text("""
            UPDATE node n
            SET team_id = t.id
            FROM team t
            WHERE t.owner_id = n.user_id
              AND t.is_personal = true
              AND n.team_id IS NULL
        """)
    )

    if "team_id" not in node_columns:
        # Now that every row has a value, apply NOT NULL and FK.
        op.alter_column("node", "team_id", nullable=False)
        op.create_foreign_key(
            "fk_node_team_id", "node", "team", ["team_id"], ["id"]
        )
        op.create_index("ix_node_team_id", "node", ["team_id"])
    else:
        # Column existed already (from prior schema change). Ensure FK and index
        # are present — add them only if missing to avoid duplicate-constraint errors.
        existing_fks = {fk["name"] for fk in inspector.get_foreign_keys("node")}
        if "fk_node_team_id" not in existing_fks:
            # Check if any FK already points node.team_id → team.id
            fk_exists = any(
                fk.get("referred_table") == "team" and "team_id" in fk.get("constrained_columns", [])
                for fk in inspector.get_foreign_keys("node")
            )
            if not fk_exists:
                op.create_foreign_key(
                    "fk_node_team_id", "node", "team", ["team_id"], ["id"]
                )

        existing_indexes = {idx["name"] for idx in inspector.get_indexes("node")}
        if "ix_node_team_id" not in existing_indexes:
            op.create_index("ix_node_team_id", "node", ["team_id"])


def downgrade() -> None:
    # Removing teams would orphan node rows — not safe to reverse automatically.
    pass
