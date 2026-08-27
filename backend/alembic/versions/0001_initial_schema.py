"""Initial schema — all tables for IUSConnect."""
from typing import Sequence, Union
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:

    op.execute("""
        CREATE TABLE users (
            id                            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            email                         VARCHAR(255) UNIQUE NOT NULL,
            username                      VARCHAR(50)  UNIQUE NOT NULL,
            display_name                  VARCHAR(100) NOT NULL,
            password_hash                 TEXT         NOT NULL,
            bio                           TEXT,
            avatar_url                    TEXT,
            is_email_verified             BOOLEAN      NOT NULL DEFAULT FALSE,
            email_verification_token      TEXT,
            email_verification_expires_at TIMESTAMPTZ,
            is_active                     BOOLEAN      NOT NULL DEFAULT TRUE,
            is_admin                      BOOLEAN      NOT NULL DEFAULT FALSE,
            created_at                    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            updated_at                    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        )
    """)

    op.execute("""
        CREATE TABLE clubs (
            id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
            name        VARCHAR(100) UNIQUE NOT NULL,
            slug        VARCHAR(100) UNIQUE NOT NULL,
            description TEXT,
            avatar_url  TEXT,
            created_by  UUID         NOT NULL REFERENCES users(id),
            is_private  BOOLEAN      NOT NULL DEFAULT FALSE,
            created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        )
    """)

    op.execute("""
        CREATE TABLE club_members (
            club_id   UUID        NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
            user_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role      VARCHAR(20) NOT NULL DEFAULT 'member'
                      CHECK (role IN ('member', 'moderator', 'owner')),
            joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (club_id, user_id)
        )
    """)

    op.execute("""
        CREATE TABLE posts (
            id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            -- NULL for anonymous posts — enforced by the anon_post_no_author constraint
            author_id      UUID        REFERENCES users(id) ON DELETE SET NULL,
            content        TEXT        NOT NULL,
            post_type      VARCHAR(20) NOT NULL
                           CHECK (post_type IN ('feed', 'club', 'anonymous_qa')),
            -- Only set when post_type = 'club'
            club_id        UUID        REFERENCES clubs(id) ON DELETE CASCADE,
            -- Self-referential: NULL = top-level post, non-NULL = reply
            parent_post_id UUID        REFERENCES posts(id) ON DELETE CASCADE,
            is_anonymous   BOOLEAN     NOT NULL DEFAULT FALSE,
            is_deleted     BOOLEAN     NOT NULL DEFAULT FALSE,
            deleted_at     TIMESTAMPTZ,
            created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            -- Club posts must name a club; other posts must not
            CONSTRAINT club_post_has_club
                CHECK (post_type != 'club' OR club_id IS NOT NULL),
            CONSTRAINT non_club_post_no_club
                CHECK (post_type = 'club' OR club_id IS NULL),
            -- Anonymity is enforced at the column level: if is_anonymous, author_id must be NULL
            CONSTRAINT anon_post_no_author
                CHECK (is_anonymous = FALSE OR author_id IS NULL)
        )
    """)

    op.execute("""
        CREATE TABLE anonymous_post_authors (
            post_id    UUID        PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
            user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    op.execute("""
        CREATE TABLE votes (
            post_id    UUID       NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
            user_id    UUID       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            vote_type  VARCHAR(4) NOT NULL CHECK (vote_type IN ('up', 'down')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            -- The DB itself prevents double-voting; no application logic needed
            PRIMARY KEY (post_id, user_id)
        )
    """)

    op.execute("""
        CREATE TABLE chat_messages (
            id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            club_id    UUID        NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
            author_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            content    TEXT        NOT NULL,
            is_deleted BOOLEAN     NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    # Indexes for the most common query patterns
    op.execute("CREATE INDEX idx_posts_author       ON posts(author_id)")
    op.execute("CREATE INDEX idx_posts_club         ON posts(club_id)")
    op.execute("CREATE INDEX idx_posts_parent       ON posts(parent_post_id)")
    op.execute("CREATE INDEX idx_posts_type_created ON posts(post_type, created_at DESC)")
    op.execute("CREATE INDEX idx_votes_post         ON votes(post_id)")
    op.execute("CREATE INDEX idx_club_members_user  ON club_members(user_id)")
    op.execute("CREATE INDEX idx_chat_club_created  ON chat_messages(club_id, created_at ASC)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS chat_messages CASCADE")
    op.execute("DROP TABLE IF EXISTS votes CASCADE")
    op.execute("DROP TABLE IF EXISTS anonymous_post_authors CASCADE")
    op.execute("DROP TABLE IF EXISTS posts CASCADE")
    op.execute("DROP TABLE IF EXISTS club_members CASCADE")
    op.execute("DROP TABLE IF EXISTS clubs CASCADE")
    op.execute("DROP TABLE IF EXISTS users CASCADE")
