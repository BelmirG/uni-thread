"""Add muted_by columns to conversations for per-user notification muting

Revision ID: 0019
Revises: 0018
Create Date: 2026-06-30
"""
from alembic import op
import sqlalchemy as sa

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "conversations",
        sa.Column("muted_by_user1", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "conversations",
        sa.Column("muted_by_user2", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("conversations", "muted_by_user2")
    op.drop_column("conversations", "muted_by_user1")
