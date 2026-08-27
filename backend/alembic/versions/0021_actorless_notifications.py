"""Allow notifications without an actor."""
from alembic import op
import sqlalchemy as sa

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("notifications", "actor_id", nullable=True)


def downgrade() -> None:
    op.execute("DELETE FROM notifications WHERE actor_id IS NULL")
    op.alter_column("notifications", "actor_id", nullable=False)
