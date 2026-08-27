"""Add conversations and direct_messages tables."""
from typing import Sequence, Union
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE conversations (
            id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user1_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            user2_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_conversation_pair UNIQUE (user1_id, user2_id),
            CONSTRAINT ck_conversation_user_order CHECK (user1_id < user2_id)
        )
    """)
    op.execute("""
        CREATE TABLE direct_messages (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            sender_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            content         TEXT,
            shared_post_id  UUID REFERENCES posts(id) ON DELETE SET NULL,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX idx_dm_conv_time ON direct_messages(conversation_id, created_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS direct_messages CASCADE")
    op.execute("DROP TABLE IF EXISTS conversations CASCADE")
