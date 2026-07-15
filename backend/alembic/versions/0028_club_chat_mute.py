"""Per-club chat mute.

club_members.chat_muted — the member still sees everything in the app; muting
only stops the browser-push for regular chat messages in that one club.

Revision ID: 0028
Revises: 0027
"""
import sqlalchemy as sa
from alembic import op

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "club_members",
        sa.Column("chat_muted", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("club_members", "chat_muted")
