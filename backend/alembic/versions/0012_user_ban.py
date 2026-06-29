"""Add ban_reason and banned_at to users

Revision ID: 0012
Revises: 0011
Create Date: 2026-06-29
"""

revision = '0012'
down_revision = '0011'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.add_column('users', sa.Column('ban_reason', sa.Text(), nullable=True))
    op.add_column('users', sa.Column('banned_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'banned_at')
    op.drop_column('users', 'ban_reason')
