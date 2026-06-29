"""Add is_read to direct_messages

Revision ID: 0009
Revises: 0008
Create Date: 2026-06-29
"""

from alembic import op
import sqlalchemy as sa

revision = '0009'
down_revision = '0008'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'direct_messages',
        sa.Column('is_read', sa.Boolean(), nullable=False, server_default=sa.text('false')),
    )


def downgrade():
    op.drop_column('direct_messages', 'is_read')
