"""Add post edit tracking, bookmarks, and mention notification references."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("posts", sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True))

    op.add_column("notifications", sa.Column("reference_id", UUID(as_uuid=True), nullable=True))

    op.create_table(
        "bookmarks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("post_id", UUID(as_uuid=True), sa.ForeignKey("posts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "post_id", name="uq_bookmark_user_post"),
    )
    op.create_index("ix_bookmarks_user_created", "bookmarks", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_bookmarks_user_created", table_name="bookmarks")
    op.drop_table("bookmarks")
    op.drop_column("notifications", "reference_id")
    op.drop_column("posts", "edited_at")
