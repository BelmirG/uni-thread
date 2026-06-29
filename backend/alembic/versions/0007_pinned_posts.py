"""Add is_pinned to posts

Revision ID: 0007
Revises: 0006
Create Date: 2026-06-28
"""

from alembic import op
import sqlalchemy as sa

revision = '0007'
down_revision = '0006'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'posts',
        sa.Column('is_pinned', sa.Boolean(), nullable=False, server_default=sa.text('false')),
    )


def downgrade():
    op.drop_column('posts', 'is_pinned')
