"""One place that turns 'something happened' into a notification."""
import json
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import redis
from app.core.webpush import send_web_push
from app.models.notification import Notification
from app.models.user import User

NOTIFICATION_CATEGORIES = ("mentions", "replies", "follows", "milestones", "clubs", "qa_answers")


def category_of(notification_type: str) -> str | None:
    """Map an internal type string to its user-facing preference category."""
    if notification_type in ("mention", "chat_mention"):
        return "mentions"
    if notification_type == "reply":
        return "replies"
    if notification_type == "follow":
        return "follows"
    if notification_type.startswith("milestone"):
        return "milestones"
    if notification_type.startswith("club_"):
        return "clubs"
    if notification_type == "qa_answer":
        return "qa_answers"
    return None


async def push_live(db: AsyncSession, user_id: uuid.UUID, payload: dict) -> None:
    """Live delivery of a notification payload: WS toast (Redis) + browser push."""
    await redis.publish(f"notif:{user_id}", json.dumps(payload))
    await send_web_push(db, user_id, payload)


async def is_muted(db: AsyncSession, user_id: uuid.UUID, notification_type: str) -> bool:
    """Has this user muted the category this notification type belongs to?"""
    category = category_of(notification_type)
    if category is None:
        return False
    muted = (await db.execute(
        select(User.muted_notifications).where(User.id == user_id)
    )).scalar_one_or_none()
    return bool(muted) and category in muted


async def notify(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    type: str,
    actor: User | None = None,
    reference_id: uuid.UUID | None = None,
    payload_type: str | None = None,
    extra: dict | None = None,
    commit: bool = True,
) -> None:
    """Persist a notification and push it live."""
    if actor is not None:
        from app.core.blocks import is_blocked_pair
        if await is_blocked_pair(db, user_id, actor.id):
            return

    db.add(Notification(
        user_id=user_id,
        actor_id=actor.id if actor else None,
        type=type,
        reference_id=reference_id,
    ))
    if commit:
        await db.commit()

    payload: dict = {"type": payload_type or type}
    if actor:
        payload["actor_username"] = actor.username
        payload["actor_display_name"] = actor.display_name
        payload["actor_avatar_url"] = actor.avatar_url
    if extra:
        payload.update(extra)
    if await is_muted(db, user_id, type):
        payload["silent"] = True
    await push_live(db, user_id, payload)
