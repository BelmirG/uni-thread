from fastapi import APIRouter, Depends
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.database import get_db
from app.dependencies import get_current_user
from app.models.notification import Notification
from app.models.user import User

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
async def get_notifications(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    Actor = aliased(User)
    rows = (await db.execute(
        select(Notification, Actor)
        .join(Actor, Actor.id == Notification.actor_id)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(30)
    )).all()
    return [
        {
            "id": str(n.id),
            "type": n.type,
            "is_read": n.is_read,
            "created_at": n.created_at.isoformat(),
            "actor_username": actor.username,
            "actor_display_name": actor.display_name,
            "actor_avatar_url": actor.avatar_url,
        }
        for n, actor in rows
    ]


@router.post("/mark-read")
async def mark_all_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await db.execute(
        update(Notification)
        .where(Notification.user_id == current_user.id, Notification.is_read == False)
        .values(is_read=True)
    )
    await db.commit()
    return {"ok": True}
