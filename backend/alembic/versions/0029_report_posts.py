"""Post reports."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "reports",
        sa.Column(
            "reported_post_id",
            UUID(as_uuid=True),
            sa.ForeignKey("posts.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.alter_column("reports", "reported_user_id", nullable=True)


def downgrade() -> None:
    op.execute("DELETE FROM reports WHERE reported_user_id IS NULL")
    op.alter_column("reports", "reported_user_id", nullable=False)
    op.drop_column("reports", "reported_post_id")
