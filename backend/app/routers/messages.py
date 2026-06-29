import asyncio
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import case, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.redis import redis
from app.core.security import decode_access_token
from app.database import AsyncSessionLocal, get_db
from app.dependencies import get_current_user
from app.models.conversation import Conversation
from app.models.direct_message import DirectMessage
from app.models.post import Post
from app.models.user import User

router = APIRouter(prefix="/api/messages", tags=["messages"])


# ── helpers ───────────────────────────────────────────────────────────────────

def _ordered_pair(a: uuid.UUID, b: uuid.UUID) -> tuple[uuid.UUID, uuid.UUID]:
    """Return (min, max) so user1_id < user2_id matches the DB CHECK constraint."""
    return (a, b) if str(a) < str(b) else (b, a)


async def _get_or_create_conversation(
    current_user: User, other_user: User, db: AsyncSession
) -> Conversation:
    u1, u2 = _ordered_pair(current_user.id, other_user.id)
    stmt = pg_insert(Conversation).values(user1_id=u1, user2_id=u2)
    stmt = stmt.on_conflict_do_nothing(constraint="uq_conversation_pair")
    await db.execute(stmt)
    await db.commit()
    conv = (await db.execute(
        select(Conversation).where(Conversation.user1_id == u1, Conversation.user2_id == u2)
    )).scalar_one()
    return conv


def _build_msg_payload(
    msg: DirectMessage,
    sender: User,
    shared_post: Post | None,
    post_author: User | None,
) -> dict:
    shared = None
    if shared_post is not None:
        shared = {
            "id": str(shared_post.id),
            "content": shared_post.content if not shared_post.is_deleted else None,
            "is_deleted": shared_post.is_deleted,
            "author": {
                "username": post_author.username if post_author else "?",
                "display_name": post_author.display_name if post_author else "?",
            } if not shared_post.is_deleted else None,
        }
    return {
        "id": str(msg.id),
        "content": msg.content,
        "shared_post": shared,
        "sender": {"username": sender.username, "display_name": sender.display_name},
        "created_at": msg.created_at.isoformat(),
    }


# ── REST endpoints (literal paths first, then parameterised) ──────────────────

@router.get("/search-users")
async def search_users(
    q: str = "",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not q.strip():
        return []
    pattern = f"%{q.strip()}%"
    rows = (await db.execute(
        select(User.username, User.display_name)
        .where(
            User.id != current_user.id,
            or_(User.username.ilike(pattern), User.display_name.ilike(pattern)),
        )
        .limit(10)
    )).all()
    return [{"username": r.username, "display_name": r.display_name} for r in rows]


@router.get("")
async def list_conversations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Unread count per conversation (messages sent by the other user that are unread)
    unread_subq = (
        select(
            DirectMessage.conversation_id,
            func.count(DirectMessage.id).label("unread_count"),
        )
        .where(DirectMessage.sender_id != current_user.id, DirectMessage.is_read == False)
        .group_by(DirectMessage.conversation_id)
        .subquery("unread_subq")
    )

    # Window-function subquery: rank messages newest-first within each conversation
    dm_ranked = (
        select(
            DirectMessage.conversation_id,
            DirectMessage.content,
            DirectMessage.shared_post_id,
            DirectMessage.sender_id,
            DirectMessage.created_at,
            func.row_number()
            .over(
                partition_by=DirectMessage.conversation_id,
                order_by=DirectMessage.created_at.desc(),
            )
            .label("rn"),
        )
        .subquery("dm_ranked")
    )
    last_msg = select(dm_ranked).where(dm_ranked.c.rn == 1).subquery("last_msg")

    OtherUser = aliased(User)
    SenderUser = aliased(User)

    other_user_id_expr = case(
        (Conversation.user1_id == current_user.id, Conversation.user2_id),
        else_=Conversation.user1_id,
    )

    rows = (await db.execute(
        select(
            Conversation.id,
            OtherUser.username,
            OtherUser.display_name,
            last_msg.c.content,
            last_msg.c.shared_post_id,
            last_msg.c.created_at,
            SenderUser.username.label("last_sender"),
            func.coalesce(unread_subq.c.unread_count, 0).label("unread_count"),
        )
        .join(OtherUser, OtherUser.id == other_user_id_expr)
        .outerjoin(last_msg, last_msg.c.conversation_id == Conversation.id)
        .outerjoin(SenderUser, SenderUser.id == last_msg.c.sender_id)
        .outerjoin(unread_subq, unread_subq.c.conversation_id == Conversation.id)
        .where(
            or_(
                Conversation.user1_id == current_user.id,
                Conversation.user2_id == current_user.id,
            )
        )
        .order_by(last_msg.c.created_at.desc().nulls_last())
    )).all()

    result = []
    for r in rows:
        last = None
        if r.created_at is not None:
            last = {
                "content": r.content,
                "is_post_share": r.shared_post_id is not None,
                "sender_username": r.last_sender,
                "created_at": r.created_at.isoformat(),
            }
        result.append({
            "conversation_id": str(r.id),
            "other_user": {"username": r.username, "display_name": r.display_name},
            "last_message": last,
            "unread_count": r.unread_count,
        })
    return result


class OpenRequest(BaseModel):
    username: str


@router.post("/open")
async def open_conversation(
    body: OpenRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    other = (await db.execute(
        select(User).where(User.username == body.username)
    )).scalar_one_or_none()
    if not other:
        raise HTTPException(status_code=404, detail="User not found.")
    if other.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot message yourself.")

    conv = await _get_or_create_conversation(current_user, other, db)
    return {
        "conversation_id": str(conv.id),
        "other_user": {"username": other.username, "display_name": other.display_name},
    }


class ShareRequest(BaseModel):
    recipient_username: str
    post_id: str
    content: str = ""


@router.post("/share")
async def share_post(
    body: ShareRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    other = (await db.execute(
        select(User).where(User.username == body.recipient_username)
    )).scalar_one_or_none()
    if not other:
        raise HTTPException(status_code=404, detail="User not found.")
    if other.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot message yourself.")

    try:
        post_id = uuid.UUID(body.post_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid post ID.")

    post = (await db.execute(select(Post).where(Post.id == post_id))).scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found.")

    post_author = None
    if post.author_id:
        post_author = (await db.execute(
            select(User).where(User.id == post.author_id)
        )).scalar_one_or_none()

    conv = await _get_or_create_conversation(current_user, other, db)

    msg = DirectMessage(
        conversation_id=conv.id,
        sender_id=current_user.id,
        content=body.content or None,
        shared_post_id=post.id,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    payload = json.dumps(_build_msg_payload(msg, current_user, post, post_author))
    await redis.publish(f"dm:{conv.id}", payload)

    return {"conversation_id": str(conv.id)}


@router.get("/unread-count")
async def unread_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    count = (await db.execute(
        select(func.count(DirectMessage.id))
        .join(Conversation, Conversation.id == DirectMessage.conversation_id)
        .where(
            or_(Conversation.user1_id == current_user.id, Conversation.user2_id == current_user.id),
            DirectMessage.sender_id != current_user.id,
            DirectMessage.is_read == False,
        )
    )).scalar() or 0
    return {"count": count}


@router.get("/{conversation_id}")
async def get_messages(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        conv_id = uuid.UUID(conversation_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    conv = (await db.execute(
        select(Conversation).where(Conversation.id == conv_id)
    )).scalar_one_or_none()
    if not conv or (conv.user1_id != current_user.id and conv.user2_id != current_user.id):
        raise HTTPException(status_code=403, detail="Access denied.")

    other_user_id = conv.user2_id if conv.user1_id == current_user.id else conv.user1_id
    other_user = (await db.execute(
        select(User).where(User.id == other_user_id)
    )).scalar_one()

    SenderUser = aliased(User)
    SharedPost = aliased(Post)
    PostAuthor = aliased(User)

    rows = (await db.execute(
        select(DirectMessage, SenderUser, SharedPost, PostAuthor)
        .join(SenderUser, SenderUser.id == DirectMessage.sender_id)
        .outerjoin(SharedPost, SharedPost.id == DirectMessage.shared_post_id)
        .outerjoin(PostAuthor, PostAuthor.id == SharedPost.author_id)
        .where(DirectMessage.conversation_id == conv_id)
        .order_by(DirectMessage.created_at.asc())
        .limit(50)
    )).all()

    # Mark all unread messages from the other person as read
    await db.execute(
        update(DirectMessage)
        .where(
            DirectMessage.conversation_id == conv_id,
            DirectMessage.sender_id != current_user.id,
            DirectMessage.is_read == False,
        )
        .values(is_read=True)
    )
    await db.commit()

    return {
        "other_user": {"username": other_user.username, "display_name": other_user.display_name},
        "messages": [_build_msg_payload(row[0], row[1], row[2], row[3]) for row in rows],
    }


# ── WebSocket ──────────────────────────────────────────────────────────────────

@router.websocket("/{conversation_id}/ws")
async def dm_websocket(websocket: WebSocket, conversation_id: str):
    token = websocket.cookies.get("access_token")
    if not token:
        await websocket.close(code=4001, reason="Not authenticated")
        return

    user_id_str = decode_access_token(token)
    if not user_id_str:
        await websocket.close(code=4001, reason="Invalid or expired token")
        return

    try:
        conv_id = uuid.UUID(conversation_id)
    except ValueError:
        await websocket.close(code=4004, reason="Invalid conversation ID")
        return

    async with AsyncSessionLocal() as db:
        user = (await db.execute(
            select(User).where(User.id == uuid.UUID(user_id_str))
        )).scalar_one_or_none()
        if not user or not user.is_active:
            await websocket.close(code=4001, reason="User not found")
            return

        conv = (await db.execute(
            select(Conversation).where(Conversation.id == conv_id)
        )).scalar_one_or_none()
        if not conv or (conv.user1_id != user.id and conv.user2_id != user.id):
            await websocket.close(code=4003, reason="Access denied")
            return

        await websocket.accept()

        channel = f"dm:{conv_id}"
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

                content = (data.get("content") or "").strip()
                shared_post_id_str = data.get("shared_post_id")

                if not content and not shared_post_id_str:
                    continue

                shared_post = None
                post_author = None
                shared_post_uuid = None

                if shared_post_id_str:
                    try:
                        shared_post_uuid = uuid.UUID(shared_post_id_str)
                        SharedPost = aliased(Post)
                        PostAuthor = aliased(User)
                        row = (await db.execute(
                            select(SharedPost, PostAuthor)
                            .outerjoin(PostAuthor, PostAuthor.id == SharedPost.author_id)
                            .where(SharedPost.id == shared_post_uuid)
                        )).first()
                        if row:
                            shared_post, post_author = row[0], row[1]
                    except (ValueError, Exception):
                        pass

                dm = DirectMessage(
                    conversation_id=conv_id,
                    sender_id=user.id,
                    content=content or None,
                    shared_post_id=shared_post_uuid,
                )
                db.add(dm)
                await db.commit()
                await db.refresh(dm)

                payload = json.dumps(_build_msg_payload(dm, user, shared_post, post_author))
                await redis.publish(channel, payload)

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
