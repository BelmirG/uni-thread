"""add file_attachments to posts

Revision ID: 0015
Revises: 0014
Create Date: 2026-06-30
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = '0015'
down_revision = '0014'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'posts',
        sa.Column(
            'file_attachments',
            JSONB,
            nullable=False,
            server_default='[]',
        )
    )


def downgrade() -> None:
    op.drop_column('posts', 'file_attachments')
