"""fix missing columns in project table

The c1d2e3f4a5b6 migration skips CREATE TABLE when project already exists,
leaving any columns added since the original table creation absent. This
migration adds all potentially missing columns with column-existence guards
so it is safe to run regardless of the current schema state.

Revision ID: a5b6c7d8e9f0
Revises: f4a5b6c7d8e9
Create Date: 2026-04-10 00:00:00.000000

"""
import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "a5b6c7d8e9f0"
down_revision = "f4a5b6c7d8e9"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = inspect(conn)
    project_columns = [col["name"] for col in inspector.get_columns("project")]
    project_indexes = [idx["name"] for idx in inspector.get_indexes("project")]

    if "node_id" not in project_columns:
        op.add_column("project", sa.Column("node_id", sa.Uuid(), nullable=True))
        op.create_foreign_key(
            "fk_project_node_id_node", "project", "node", ["node_id"], ["id"]
        )

    if "cwd" not in project_columns:
        op.add_column(
            "project",
            sa.Column(
                "cwd",
                sqlmodel.sql.sqltypes.AutoString(length=4096),
                nullable=True,
            ),
        )

    if "user_id" not in project_columns:
        op.add_column("project", sa.Column("user_id", sa.Uuid(), nullable=True))
        op.create_foreign_key(
            "fk_project_user_id_user", "project", "user", ["user_id"], ["id"]
        )

    # Create user_id index if missing — safe whether user_id was pre-existing or just added above
    if "ix_project_user_id" not in project_indexes:
        op.create_index(op.f("ix_project_user_id"), "project", ["user_id"], unique=False)

    if "created_at" not in project_columns:
        op.add_column(
            "project",
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade():
    conn = op.get_bind()
    inspector = inspect(conn)
    project_columns = [col["name"] for col in inspector.get_columns("project")]
    project_indexes = [idx["name"] for idx in inspector.get_indexes("project")]

    if "ix_project_user_id" in project_indexes:
        op.drop_index(op.f("ix_project_user_id"), table_name="project")
    if "created_at" in project_columns:
        op.drop_column("project", "created_at")
    if "user_id" in project_columns:
        op.drop_column("project", "user_id")
    if "cwd" in project_columns:
        op.drop_column("project", "cwd")
    if "node_id" in project_columns:
        op.drop_column("project", "node_id")
