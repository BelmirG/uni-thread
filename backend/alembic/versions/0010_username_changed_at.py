"""Add username_changed_at to users

Revision ID: 0010
Revises: 0009
Create Date: 2026-06-29
"""

from alembic import op
import sqlalchemy as sa

revision = '0010'
down_revision = '0009'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'users',
        sa.Column('username_changed_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade():
    op.drop_column('users', 'username_changed_at')
