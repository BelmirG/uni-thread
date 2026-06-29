"""Add poll_options and poll_votes tables

Revision ID: 0014
Revises: 0013
Create Date: 2026-06-29
"""

revision = '0014'
down_revision = '0013'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


def upgrade() -> None:
    op.add_column('posts', sa.Column('poll_expires_at', sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        'poll_options',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('post_id', UUID(as_uuid=True), sa.ForeignKey('posts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('text', sa.String(200), nullable=False),
        sa.Column('position', sa.Integer, nullable=False),
    )
    op.create_index('ix_poll_options_post_id', 'poll_options', ['post_id'])

    op.create_table(
        'poll_votes',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('post_id', UUID(as_uuid=True), sa.ForeignKey('posts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('poll_option_id', UUID(as_uuid=True), sa.ForeignKey('poll_options.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.UniqueConstraint('post_id', 'user_id', name='uq_poll_votes_post_user'),
    )
    op.create_index('ix_poll_votes_post_id', 'poll_votes', ['post_id'])


def downgrade() -> None:
    op.drop_table('poll_votes')
    op.drop_table('poll_options')
    op.drop_column('posts', 'poll_expires_at')
