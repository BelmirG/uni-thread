"""Add club_invitations table

Revision ID: 0008
Revises: 0007
Create Date: 2026-06-29
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '0008'
down_revision = '0007'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'club_invitations',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('club_id', UUID(as_uuid=True), sa.ForeignKey('clubs.id', ondelete='CASCADE'), nullable=False),
        sa.Column('invited_by', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('invited_user_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_unique_constraint(
        'uq_club_invitations_club_user',
        'club_invitations',
        ['club_id', 'invited_user_id'],
    )


def downgrade():
    op.drop_table('club_invitations')
