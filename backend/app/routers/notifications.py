import asyncio
import json
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from pydantic import BaseModel

from app.config import settings
from app.core.redis import redis
from app.core.security import decode_access_token
from app.database import get_db
from app.dependencies import get_current_user
from app.models.club import Club
from app.models.notification import Notification
from app.models.post import Post
from app.models.push_subscription import PushSubscription
from app.models.user import User

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
async def get_notifications(
    limit: int = 30,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import func

    await db.execute(
        delete(Notification).where(
            Notification.user_id == current_user.id,
            Notification.is_read == True,
            Notification.created_at < datetime.now(timezone.utc) - timedelta(days=7),
        )
    )
    await db.commit()

    Actor = aliased(User)
    base = (
        select(Notification, Actor, Post.post_type, Club.slug, Club.name)
        .outerjoin(Actor, Actor.id == Notification.actor_id)
        .outerjoin(Post, Post.id == Notification.reference_id)
        .outerjoin(Club, or_(Club.id == Notification.reference_id, Club.id == Post.club_id))
        .where(Notification.user_id == current_user.id)
    )
    total = (await db.execute(
        select(func.count()).select_from(Notification).where(Notification.user_id == current_user.id)
    )).scalar_one()
    rows = (await db.execute(
        base.order_by(Notification.created_at.desc()).limit(limit).offset(offset)
    )).all()
    return {
        "total": total,
        "notifications": [
            {
                "id": str(n.id),
                "type": n.type,
                "reference_id": str(n.reference_id) if n.reference_id else None,
                "reference_post_type": post_type,
                "reference_club_slug": club_slug,
                "reference_club_name": club_name,
                "is_read": n.is_read,
                "created_at": n.created_at.isoformat(),
                "actor_username": actor.username if actor else None,
                "actor_display_name": actor.display_name if actor else None,
                "actor_avatar_url": actor.avatar_url if actor else None,
            }
            for n, actor, post_type, club_slug, club_name in rows
        ],
    }


@router.get("/unread-count")
async def unread_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import func

    count = (await db.execute(
        select(func.count()).select_from(Notification).where(
            Notification.user_id == current_user.id,
            Notification.is_read == False,
        )
    )).scalar_one()
    return {"count": count}


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


# ── Browser push subscriptions ────────────────────────────────────────────────

class PushKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscribeRequest(BaseModel):
    endpoint: str
    keys: PushKeys


class PushUnsubscribeRequest(BaseModel):
    endpoint: str


@router.get("/push/public-key")
async def push_public_key():
    """The VAPID public key browsers need to subscribe."""
    return {"key": settings.vapid_public_key, "enabled": settings.push_configured}


@router.post("/push/subscribe", status_code=204)
async def push_subscribe(
    body: PushSubscribeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = (await db.execute(
        select(PushSubscription).where(PushSubscription.endpoint == body.endpoint)
    )).scalar_one_or_none()
    if existing:
        existing.user_id = current_user.id
        existing.p256dh = body.keys.p256dh
        existing.auth = body.keys.auth
    else:
        db.add(PushSubscription(
            user_id=current_user.id,
            endpoint=body.endpoint,
            p256dh=body.keys.p256dh,
            auth=body.keys.auth,
        ))
    await db.commit()


@router.post("/push/unsubscribe", status_code=204)
async def push_unsubscribe(
    body: PushUnsubscribeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await db.execute(
        delete(PushSubscription).where(
            PushSubscription.endpoint == body.endpoint,
            PushSubscription.user_id == current_user.id,
        )
    )
    await db.commit()


@router.websocket("/ws")
async def notifications_ws(websocket: WebSocket):
    """WebSocket endpoint for real-time push notifications."""
    token = websocket.cookies.get("access_token")
    if not token:
        await websocket.close(code=4001, reason="Not authenticated")
        return
    user_id_str = decode_access_token(token)
    if not user_id_str:
        await websocket.close(code=4001, reason="Invalid token")
        return

    user_id = uuid.UUID(user_id_str)
    await websocket.accept()

    channel = f"notif:{user_id}"
    pubsub = redis.pubsub()
    await pubsub.subscribe(channel)

    try:
        async for msg in pubsub.listen():
            if msg["type"] == "message":
                try:
                    await websocket.send_text(msg["data"])
                except (WebSocketDisconnect, Exception):
                    break
    except (WebSocketDisconnect, asyncio.CancelledError, Exception):
        pass
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.aclose()
