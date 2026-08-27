"""add attachments to direct_messages."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "direct_messages",
        sa.Column(
            "attachments",
            JSONB,
            nullable=False,
            server_default="[]",
        ),
    )


def downgrade():
    op.drop_column("direct_messages", "attachments")
