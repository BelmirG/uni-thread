"""User blocking — the one place that answers "are these two blocked?"."""
import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.block import Block


async def blocked_user_ids(db: AsyncSession, user_id: uuid.UUID) -> set[uuid.UUID]:
    """Every user id `user_id` must not see: those they blocked *and* those who."""
    rows = (await db.execute(
        select(Block.blocker_id, Block.blocked_id).where(
            or_(Block.blocker_id == user_id, Block.blocked_id == user_id)
        )
    )).all()
    ids = set()
    for blocker_id, blocked_id in rows:
        ids.add(blocked_id if blocker_id == user_id else blocker_id)
    return ids


async def is_blocked_pair(db: AsyncSession, a: uuid.UUID, b: uuid.UUID) -> bool:
    """True if either user has blocked the other."""
    if a == b:
        return False
    hit = (await db.execute(
        select(Block.blocker_id).where(
            or_(
                (Block.blocker_id == a) & (Block.blocked_id == b),
                (Block.blocker_id == b) & (Block.blocked_id == a),
            )
        ).limit(1)
    )).scalar_one_or_none()
    return hit is not None


async def block_state(
    db: AsyncSession, viewer_id: uuid.UUID, target_id: uuid.UUID
) -> tuple[bool, bool]:
    """(viewer_blocked_target, target_blocked_viewer) in one query."""
    if viewer_id == target_id:
        return False, False
    rows = (await db.execute(
        select(Block.blocker_id).where(
            or_(
                (Block.blocker_id == viewer_id) & (Block.blocked_id == target_id),
                (Block.blocker_id == target_id) & (Block.blocked_id == viewer_id),
            )
        )
    )).scalars().all()
    return viewer_id in rows, target_id in rows


def visible_author_clause(author_column, hidden_ids: set[uuid.UUID]):
    """WHERE clause hiding posts written by blocked users."""
    if not hidden_ids:
        return None
    return or_(author_column.is_(None), author_column.notin_(hidden_ids))
