import asyncio
import json
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.mentions import extract_mention_usernames
from app.core.notify import push_live
from app.core.redis import redis
from app.core.security import decode_access_token
from app.core.webpush import send_web_push
from app.database import AsyncSessionLocal, get_db
from app.dependencies import get_current_user
from app.models.chat_message import ChatMessage
from app.models.club import Club
from app.models.club_member import ClubMember
from app.models.notification import Notification
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/clubs", tags=["chat"])

# Fire-and-forget push tasks — kept referenced so the event loop can't GC them
# mid-flight.
_push_tasks: set[asyncio.Task] = set()


async def _broadcast_chat_push(
    club_id: uuid.UUID,
    club_name: str,
    club_slug: str,
    sender: dict,
    content: str,
    attachments: list[dict],
) -> None:
    """Browser-push a club chat message to every member except the sender.

    Push-only on purpose: no bell row and no in-app toast — chat is too
    high-frequency for those, and anyone with a visible tab sees the message
    live anyway (the service worker also suppresses banners for visible tabs).
    Members tagged with @mention are skipped here — they already get the more
    specific chat_mention notification. Runs in its own session because the
    caller's WS loop must not block on N push deliveries.
    """
    try:
        async with AsyncSessionLocal() as db:
            mentioned = set(extract_mention_usernames(content or ""))
            rows = (await db.execute(
                select(User.id, User.username, User.muted_notifications, ClubMember.chat_muted)
                .join(ClubMember, ClubMember.user_id == User.id)
                .where(ClubMember.club_id == club_id, User.id != sender["id"])
            )).all()

            has_photo = any(a.get("mime_type", "").startswith("image/") for a in attachments)
            has_file = any(not a.get("mime_type", "").startswith("image/") for a in attachments)
            payload = {
                "type": "club_chat",
                "actor_username": sender["username"],
                "actor_display_name": sender["display_name"],
                "actor_avatar_url": sender["avatar_url"],
                "club_name": club_name,
                "club_slug": club_slug,
                "preview": (content or "").strip()[:60],
                "has_photo": has_photo,
                "has_file": has_file,
            }
            for user_id, username, muted, chat_muted in rows:
                if chat_muted:
                    continue
                if muted and "clubs" in muted:
                    continue
                if username.lower() in mentioned:
                    continue
                await send_web_push(db, user_id, payload)
    except Exception as exc:
        logger.warning("club chat push broadcast failed: %s", exc)


async def _notify_chat_mentions(content: str, club: Club, actor: User, db) -> None:
    """Persist + push a 'chat_mention' for every club member tagged in a chat message.

    Membership is required — tagging must never leak private-club activity to
    outsiders. reference_id stores the club id so the notification can deep-link.
    """
    from sqlalchemy import func as sa_func

    names = extract_mention_usernames(content)
    if not names:
        return

    targets = (await db.execute(
        select(User)
        .join(ClubMember, ClubMember.user_id == User.id)
        .where(
            ClubMember.club_id == club.id,
            sa_func.lower(User.username).in_(names),
            User.id != actor.id,
        )
    )).scalars().all()
    if not targets:
        return

    for u in targets:
        db.add(Notification(user_id=u.id, actor_id=actor.id, type="chat_mention", reference_id=club.id))
    await db.commit()

    base = {
        "type": "chat_mention",
        "actor_username": actor.username,
        "actor_display_name": actor.display_name,
        "actor_avatar_url": actor.avatar_url,
        "club_name": club.name,
        "club_slug": club.slug,
    }
    for u in targets:
        # Muted category → still saved above (bell), but pushed without a popup.
        payload = {**base, "silent": "mentions" in (u.muted_notifications or [])}
        await push_live(db, u.id, payload)


def _build_chat_payload(msg: ChatMessage, author: User) -> dict:
    return {
        "id": str(msg.id),
        "content": msg.content,
        "attachments": msg.attachments or [],
        "author": {
            "username": author.username,
            "display_name": author.display_name,
            "avatar_url": author.avatar_url,
        },
        "created_at": msg.created_at.isoformat(),
    }


# ── REST: load recent message history ─────────────────────────────────────────

@router.get("/{slug}/chat")
async def get_chat_history(
    slug: str,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    club = (await db.execute(select(Club).where(Club.slug == slug))).scalar_one_or_none()
    if not club:
        raise HTTPException(status_code=404, detail="Club not found.")

    membership = (await db.execute(
        select(ClubMember).where(
            ClubMember.club_id == club.id, ClubMember.user_id == current_user.id
        )
    )).scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=403, detail="You must be a member to access club chat.")

    rows = (await db.execute(
        select(ChatMessage, User)
        .join(User, ChatMessage.author_id == User.id)
        .where(ChatMessage.club_id == club.id, ChatMessage.is_deleted == False)
        .order_by(ChatMessage.created_at.desc())
        .limit(limit)
    )).all()

    return list(reversed([_build_chat_payload(row[0], row[1]) for row in rows]))


# ── Per-club chat mute ─────────────────────────────────────────────────────────

async def _require_membership(slug: str, user_id: uuid.UUID, db: AsyncSession) -> ClubMember:
    club = (await db.execute(select(Club).where(Club.slug == slug))).scalar_one_or_none()
    if not club:
        raise HTTPException(status_code=404, detail="Club not found.")
    membership = (await db.execute(
        select(ClubMember).where(
            ClubMember.club_id == club.id, ClubMember.user_id == user_id
        )
    )).scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=403, detail="You must be a member of this club.")
    return membership


@router.post("/{slug}/chat/mute", status_code=204)
async def mute_club_chat(
    slug: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    membership = await _require_membership(slug, current_user.id, db)
    membership.chat_muted = True
    await db.commit()


@router.delete("/{slug}/chat/mute", status_code=204)
async def unmute_club_chat(
    slug: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    membership = await _require_membership(slug, current_user.id, db)
    membership.chat_muted = False
    await db.commit()


# ── WebSocket: real-time chat ──────────────────────────────────────────────────

@router.websocket("/{slug}/chat/ws")
async def chat_websocket(websocket: WebSocket, slug: str):
    token = websocket.cookies.get("access_token")
    if not token:
        await websocket.close(code=4001, reason="Not authenticated")
        return

    user_id_str = decode_access_token(token)
    if not user_id_str:
        await websocket.close(code=4001, reason="Invalid or expired token")
        return

    async with AsyncSessionLocal() as db:
        user = (await db.execute(
            select(User).where(User.id == uuid.UUID(user_id_str))
        )).scalar_one_or_none()
        if not user or not user.is_active:
            await websocket.close(code=4001, reason="User not found")
            return

        club = (await db.execute(select(Club).where(Club.slug == slug))).scalar_one_or_none()
        if not club:
            await websocket.close(code=4004, reason="Club not found")
            return

        membership = (await db.execute(
            select(ClubMember).where(
                ClubMember.club_id == club.id, ClubMember.user_id == user.id
            )
        )).scalar_one_or_none()
        if not membership:
            await websocket.close(code=4003, reason="Not a member of this club")
            return

        await websocket.accept()

        channel = f"club_chat:{club.id}"
        pubsub = redis.pubsub()
        await pubsub.subscribe(channel)

        async def redis_to_ws():
            async for msg in pubsub.listen():
                if msg["type"] == "message":
                    try:
                        await websocket.send_text(msg["data"])
                    except Exception:
                        return

        async def ws_to_redis():
            while True:
                try:
                    text = await websocket.receive_text()
                except (WebSocketDisconnect, Exception):
                    return

                try:
                    data = json.loads(text)
                except json.JSONDecodeError:
                    continue

                # Ephemeral typing signal — broadcast, never persisted.
                if data.get("event") == "typing":
                    await redis.publish(channel, json.dumps({
                        "event": "typing",
                        "username": user.username,
                        "display_name": user.display_name,
                    }))
                    continue

                content = (data.get("content") or "").strip()
                raw_attachments = data.get("attachments") or []
                attachments = [
                    {
                        "url": str(a.get("url", "")),
                        "name": str(a.get("name", ""))[:255],
                        "size": int(a.get("size", 0)),
                        "mime_type": str(a.get("mime_type", "")),
                    }
                    for a in raw_attachments
                    if isinstance(a, dict) and a.get("url")
                ][:5]

                if not content and not attachments:
                    continue

                if content and len(content) > 2000:
                    content = content[:2000]

                chat_msg = ChatMessage(
                    club_id=club.id,
                    author_id=user.id,
                    content=content or None,
                    attachments=attachments,
                )
                db.add(chat_msg)
                await db.commit()
                await db.refresh(chat_msg)

                payload_dict = _build_chat_payload(chat_msg, user)
                # Echo the sender's client-generated ID so their optimistic
                # "sending…" bubble can be swapped for this confirmed message.
                # Never persisted; other clients ignore it.
                client_id = data.get("client_id")
                if isinstance(client_id, str) and 0 < len(client_id) <= 64:
                    payload_dict["client_id"] = client_id
                await redis.publish(channel, json.dumps(payload_dict))

                # @mentions — notify tagged users, but only fellow club members:
                # chat in a (possibly private) club must never ping outsiders.
                await _notify_chat_mentions(content, club, user, db)

                # Browser push to everyone else, off this loop so a big club
                # never slows the sender's next message.
                if settings.push_configured:
                    task = asyncio.create_task(_broadcast_chat_push(
                        club.id, club.name, club.slug,
                        {
                            "id": user.id,
                            "username": user.username,
                            "display_name": user.display_name,
                            "avatar_url": user.avatar_url,
                        },
                        content, attachments,
                    ))
                    _push_tasks.add(task)
                    task.add_done_callback(_push_tasks.discard)

        redis_task = asyncio.create_task(redis_to_ws())
        ws_task = asyncio.create_task(ws_to_redis())

        try:
            done, pending = await asyncio.wait(
                {redis_task, ws_task},
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in pending:
                task.cancel()
                try:
                    await task
                except (asyncio.CancelledError, Exception):
                    pass
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.aclose()
