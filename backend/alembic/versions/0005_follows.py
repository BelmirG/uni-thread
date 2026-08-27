"""Add follows table."""

from alembic import op
import sqlalchemy as sa

revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'follows',
        sa.Column('follower_id', sa.dialects.postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('following_id', sa.dialects.postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('follower_id', 'following_id'),
        sa.CheckConstraint('follower_id != following_id', name='ck_no_self_follow'),
    )
    op.create_index('idx_follows_following', 'follows', ['following_id'])


def downgrade():
    op.drop_index('idx_follows_following', table_name='follows')
    op.drop_table('follows')
