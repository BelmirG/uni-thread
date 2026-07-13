"""Performance indexes for hot query paths.

- direct_messages.shared_post_id: the feed computes a share_count subquery per
  post; without this index every feed load sequential-scans the DM table.
  Partial index — only share rows have a value, ordinary DMs stay out of it.
- poll_votes.poll_option_id: poll result counts group by option on every feed
  load that contains a poll.
- conversations.user2_id: the conversation list matches either side of the
  pair; user1_id is covered by the unique-pair index, user2_id was not.

Revision ID: 0026
Revises: 0025
"""
from alembic import op

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "idx_dm_shared_post",
        "direct_messages",
        ["shared_post_id"],
        postgresql_where="shared_post_id IS NOT NULL",
    )
    op.create_index("idx_poll_votes_option", "poll_votes", ["poll_option_id"])
    op.create_index("idx_conversations_user2", "conversations", ["user2_id"])


def downgrade() -> None:
    op.drop_index("idx_conversations_user2", table_name="conversations")
    op.drop_index("idx_poll_votes_option", table_name="poll_votes")
    op.drop_index("idx_dm_shared_post", table_name="direct_messages")
