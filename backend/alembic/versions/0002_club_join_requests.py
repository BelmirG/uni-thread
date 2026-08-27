"""Add club_join_requests table for private club approval flow."""
from typing import Sequence, Union
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE club_join_requests (
            id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            club_id    UUID        NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
            user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (club_id, user_id)
        )
    """)
    op.execute("CREATE INDEX idx_join_requests_club ON club_join_requests(club_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS club_join_requests CASCADE")
