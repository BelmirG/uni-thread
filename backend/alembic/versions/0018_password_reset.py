"""add password reset token to users

Revision ID: 0018
Revises: 0017
Create Date: 2026-06-30
"""
from alembic import op
import sqlalchemy as sa

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("password_reset_token", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("password_reset_expires_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column("users", "password_reset_token")
    op.drop_column("users", "password_reset_expires_at")
