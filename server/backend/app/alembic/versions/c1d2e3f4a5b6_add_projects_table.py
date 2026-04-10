"""add_projects_table

Revision ID: c1d2e3f4a5b6
Revises: b3c4d5e6f7a8
Create Date: 2026-04-10 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = 'c1d2e3f4a5b6'
down_revision = 'b3c4d5e6f7a8'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    if not inspect(conn).has_table('project'):
        op.create_table(
            'project',
            sa.Column('name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
            sa.Column('node_id', sa.Uuid(), nullable=False),
            sa.Column('cwd', sqlmodel.sql.sqltypes.AutoString(length=4096), nullable=False),
            sa.Column('id', sa.Uuid(), nullable=False),
            sa.Column('user_id', sa.Uuid(), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(['node_id'], ['node.id'], ),
            sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index(op.f('ix_project_user_id'), 'project', ['user_id'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_project_user_id'), table_name='project')
    op.drop_table('project')
