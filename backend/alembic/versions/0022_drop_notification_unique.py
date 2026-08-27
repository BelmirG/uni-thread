"""Drop the (user, actor, type) unique constraint on notifications."""
from alembic import op

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("uq_notifications_user_actor_type", "notifications", type_="unique")


def downgrade() -> None:
    op.execute("""
        DELETE FROM notifications a USING notifications b
        WHERE a.user_id = b.user_id
          AND a.actor_id IS NOT DISTINCT FROM b.actor_id
          AND a.type = b.type
          AND a.created_at < b.created_at
    """)
    op.create_unique_constraint(
        "uq_notifications_user_actor_type", "notifications", ["user_id", "actor_id", "type"]
    )
