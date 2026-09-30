"""Account lifecycle helpers shared by self-serve and admin deletion."""
import uuid

from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.anonymous_post_author import AnonymousPostAuthor
from app.models.post import Post


async def retire_user_content(db: AsyncSession, user_id: uuid.UUID) -> int:
    """Soft-delete every post a user wrote, before their account row is deleted.

    Needed because posts.author_id is ON DELETE SET NULL: without this, a deleted
    account's posts would stay in the feed with no author — contradicting the
    Terms ("this license ends when you delete ... your account"). Anonymous posts
    are included; this reads anonymous_post_authors server-side only and returns
    nothing identifying (audited exception, see CLAUDE.md). Chat messages and DMs
    are removed by their own ON DELETE CASCADE.
    """
    anonymous = select(AnonymousPostAuthor.post_id).where(AnonymousPostAuthor.user_id == user_id)
    result = await db.execute(
        update(Post)
        .where(
            or_(Post.author_id == user_id, Post.id.in_(anonymous)),
            Post.is_deleted == False,  # noqa: E712
        )
        .values(is_deleted=True, deleted_at=func.now())
        .execution_options(synchronize_session=False)
    )
    return result.rowcount or 0
