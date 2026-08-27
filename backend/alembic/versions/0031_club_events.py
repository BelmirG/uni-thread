"""Club events."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0031"
down_revision = "0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("posts", sa.Column("event_starts_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("posts", sa.Column("event_ends_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("posts", sa.Column("event_location", sa.String(200), nullable=True))

    op.create_table(
        "event_rsvps",
        sa.Column(
            "post_id",
            UUID(as_uuid=True),
            sa.ForeignKey("posts.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_posts_event_starts_at",
        "posts",
        ["club_id", "event_starts_at"],
        postgresql_where=sa.text("event_starts_at IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_posts_event_starts_at", table_name="posts")
    op.drop_table("event_rsvps")
    op.drop_column("posts", "event_location")
    op.drop_column("posts", "event_ends_at")
    op.drop_column("posts", "event_starts_at")
