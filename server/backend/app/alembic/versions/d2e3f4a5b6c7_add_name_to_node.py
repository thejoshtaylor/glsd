"""add_name_to_node

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-04-10 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from sqlalchemy import inspect, text


# revision identifiers, used by Alembic.
revision = 'd2e3f4a5b6c7'
down_revision = 'c1d2e3f4a5b6'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    if not inspect(conn).has_column('node', 'name'):
        op.add_column(
            'node',
            sa.Column('name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        )
        conn.execute(
            text("UPDATE node SET name = COALESCE(machine_id, 'unnamed') WHERE name IS NULL")
        )
        op.alter_column('node', 'name', nullable=False)


def downgrade():
    op.drop_column('node', 'name')
