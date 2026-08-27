"""Add faculty/program to users and faculty_tag to posts."""

from alembic import op
import sqlalchemy as sa

revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None

_VALID = "('FMS','FENS','FASS','FBA','FLW','FEDU')"


def upgrade():
    op.add_column('users', sa.Column('faculty', sa.String(10), nullable=True))
    op.add_column('users', sa.Column('program', sa.String(200), nullable=True))
    op.create_check_constraint(
        'ck_user_faculty', 'users',
        f"faculty IS NULL OR faculty IN {_VALID}",
    )

    op.add_column('posts', sa.Column('faculty_tag', sa.String(10), nullable=True))
    op.create_check_constraint(
        'ck_post_faculty_tag', 'posts',
        f"faculty_tag IS NULL OR faculty_tag IN {_VALID}",
    )


def downgrade():
    op.drop_constraint('ck_post_faculty_tag', 'posts', type_='check')
    op.drop_column('posts', 'faculty_tag')
    op.drop_constraint('ck_user_faculty', 'users', type_='check')
    op.drop_column('users', 'program')
    op.drop_column('users', 'faculty')
