"""Per-poll public voting (club polls only).

posts.poll_public_votes — chosen at creation time and immutable after, so a
poll can never be flipped from anonymous to public once votes exist. Existing
polls keep the default false: every vote already cast stays anonymous.

Revision ID: 0027
Revises: 0026
"""
import sqlalchemy as sa
from alembic import op

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "posts",
        sa.Column("poll_public_votes", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("posts", "poll_public_votes")
