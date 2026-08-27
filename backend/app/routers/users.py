import json
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import or_

from app.core.redis import redis

USERNAME_RE = re.compile(r'^[a-zA-Z0-9_]{3,30}$')

from app.core.blocks import block_state, blocked_user_ids, is_blocked_pair
from app.core.constants import FACULTIES
from app.core.notify import push_live
from app.database import get_db
from app.dependencies import get_current_user
from app.models.block import Block
from app.models.club import Club
from app.models.club_member import ClubMember
from app.models.follow import Follow
from app.models.notification import Notification
from app.models.post import Post
from app.models.report import Report
from app.models.user import User
from app.routers.posts import _build_post_select, _row_to_response, _user_votes
from app.schemas.post import PostResponse

router = APIRouter(prefix="/api/users", tags=["users"])

FacultyLiteral = Optional[Literal['FMS', 'FENS', 'FASS', 'FBA', 'FLW', 'FEDU']]


class UpdateProfileRequest(BaseModel):
    username: Optional[str] = Field(default=None, min_length=3, max_length=30)
    display_name: str = Field(min_length=1, max_length=100)
    bio: str = Field(default="", max_length=300)
    faculty: FacultyLiteral = None
    program: Optional[str] = Field(default=None, max_length=200)
    avatar_url: Optional[str] = Field(default=None, max_length=500)


# ── helpers ───────────────────────────────────────────────────────────────────

async def _get_active_user(username: str, db: AsyncSession) -> User:
    user = (await db.execute(
        select(User).where(User.username == username, User.is_active == True)
    )).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return user


async def _get_visible_user(username: str, current_user: User, db: AsyncSession) -> User:
    """Like _get_active_user, but a blocked user simply doesn't exist."""
    target = await _get_active_user(username, db)
    if await is_blocked_pair(db, current_user.id, target.id):
        raise HTTPException(status_code=404, detail="User not found.")
    return target


async def _follow_counts(user_id: uuid.UUID, db: AsyncSession) -> tuple[int, int]:
    followers = (await db.execute(
        select(func.count()).where(Follow.following_id == user_id)
    )).scalar() or 0
    following = (await db.execute(
        select(func.count()).where(Follow.follower_id == user_id)
    )).scalar() or 0
    return followers, following


# ── literal paths before /{username} ──────────────────────────────────────────

@router.get("/search")
async def search_users(
    q: str = "",
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Search users by username or display name."""
    q = q.strip()
    if not q:
        return []

    pattern = f"%{q}%"
    where = [
        User.is_active == True,
        User.is_email_verified == True,
        User.id != current_user.id,
        or_(User.username.ilike(pattern), User.display_name.ilike(pattern)),
    ]
    hidden = await blocked_user_ids(db, current_user.id)
    if hidden:
        where.append(User.id.notin_(hidden))

    users = (await db.execute(
        select(User)
        .where(*where)
        .order_by(User.display_name)
        .limit(limit)
    )).scalars().all()

    if not users:
        return []

    user_ids = [u.id for u in users]
    following_ids = set(
        row[0] for row in (await db.execute(
            select(Follow.following_id).where(
                Follow.follower_id == current_user.id,
                Follow.following_id.in_(user_ids),
            )
        )).all()
    )

    return [
        {
            "username": u.username,
            "display_name": u.display_name,
            "avatar_url": u.avatar_url,
            "faculty": u.faculty,
            "program": u.program,
            "is_following": u.id in following_ids,
        }
        for u in users
    ]


@router.put("/me")
async def update_profile(
    body: UpdateProfileRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    username_changed = False

    if body.username is not None:
        new_username = body.username.strip()
        if new_username != current_user.username:
            if not USERNAME_RE.match(new_username):
                raise HTTPException(
                    status_code=400,
                    detail="Username can only contain letters, numbers, and underscores (3–30 characters).",
                )
            if current_user.username_changed_at:
                next_allowed = current_user.username_changed_at + timedelta(days=30)
                if datetime.now(timezone.utc) < next_allowed:
                    raise HTTPException(
                        status_code=400,
                        detail=f"You can change your username again on {next_allowed.strftime('%B %d, %Y')}.",
                    )
            taken = (await db.execute(
                select(User).where(User.username == new_username, User.id != current_user.id)
            )).scalar_one_or_none()
            if taken:
                raise HTTPException(status_code=400, detail="That username is already taken.")
            current_user.username = new_username
            current_user.username_changed_at = datetime.now(timezone.utc)
            username_changed = True

    current_user.display_name = body.display_name.strip()
    current_user.bio = body.bio.strip() or None
    current_user.faculty = body.faculty or None
    current_user.program = body.program.strip() if body.program else None
    if body.avatar_url is not None:
        current_user.avatar_url = body.avatar_url or None
    await db.commit()
    await db.refresh(current_user)
    return {
        "username": current_user.username,
        "display_name": current_user.display_name,
        "bio": current_user.bio,
        "faculty": current_user.faculty,
        "program": current_user.program,
        "avatar_url": current_user.avatar_url,
        "username_changed": username_changed,
        "username_changed_at": current_user.username_changed_at.isoformat() if current_user.username_changed_at else None,
    }


class NotificationPrefsRequest(BaseModel):
    prefs: dict[str, bool]


@router.get("/me/notification-prefs")
async def get_notification_prefs(
    current_user: User = Depends(get_current_user),
):
    from app.core.notify import NOTIFICATION_CATEGORIES
    muted = current_user.muted_notifications or []
    return {c: c not in muted for c in NOTIFICATION_CATEGORIES}


@router.put("/me/notification-prefs")
async def update_notification_prefs(
    body: NotificationPrefsRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.core.notify import NOTIFICATION_CATEGORIES
    unknown = set(body.prefs) - set(NOTIFICATION_CATEGORIES)
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown categories: {', '.join(sorted(unknown))}")

    muted = set(current_user.muted_notifications or [])
    for category, enabled in body.prefs.items():
        (muted.discard if enabled else muted.add)(category)
    current_user.muted_notifications = sorted(muted)
    await db.commit()
    return {c: c not in muted for c in NOTIFICATION_CATEGORIES}


class DeleteAccountRequest(BaseModel):
    password: str


@router.delete("/me")
async def delete_my_account(
    body: DeleteAccountRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Self-serve permanent account deletion."""
    from app.core.security import verify_password

    if not current_user.is_active:
        raise HTTPException(status_code=403, detail="Banned accounts cannot be self-deleted.")
    if current_user.is_admin:
        raise HTTPException(status_code=400, detail="Admin accounts cannot be deleted from the app.")
    if not verify_password(body.password, current_user.password_hash):
        raise HTTPException(status_code=403, detail="Incorrect password.")

    owned = (await db.execute(
        select(Club.name).where(Club.created_by == current_user.id)
    )).scalars().all()
    if owned:
        raise HTTPException(
            status_code=409,
            detail=f"You still own {', '.join(owned)}. Transfer or delete your club(s) first.",
        )

    await db.delete(current_user)
    await db.commit()

    from app.config import settings
    response.delete_cookie(
        key="access_token",
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        domain=settings.cookie_domain or None,
    )
    return {"ok": True}


# ── parameterised routes ───────────────────────────────────────────────────────

@router.get("/{username}")
async def get_profile(
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    target = await _get_active_user(username, db)

    i_blocked, they_blocked_me = await block_state(db, current_user.id, target.id)
    if they_blocked_me:
        raise HTTPException(status_code=404, detail="User not found.")
    if i_blocked:
        return {
            "username": target.username,
            "display_name": target.display_name,
            "bio": None,
            "faculty": None,
            "program": None,
            "avatar_url": target.avatar_url,
            "member_since": target.created_at.isoformat(),
            "post_count": 0,
            "club_count": 0,
            "follower_count": 0,
            "following_count": 0,
            "is_following": False,
            "is_own_profile": False,
            "is_blocked": True,
            "username_changed_at": None,
        }

    post_count = (await db.execute(
        select(func.count(Post.id)).where(
            Post.author_id == target.id,
            Post.post_type == "feed",
            Post.parent_post_id.is_(None),
            Post.is_deleted == False,
        )
    )).scalar() or 0

    club_count = (await db.execute(
        select(func.count(ClubMember.club_id)).where(ClubMember.user_id == target.id)
    )).scalar() or 0

    follower_count, following_count = await _follow_counts(target.id, db)

    is_following = False
    if target.id != current_user.id:
        is_following = bool((await db.execute(
            select(Follow.follower_id).where(
                Follow.follower_id == current_user.id,
                Follow.following_id == target.id,
            )
        )).scalar_one_or_none())

    return {
        "username": target.username,
        "display_name": target.display_name,
        "bio": target.bio,
        "faculty": target.faculty,
        "program": target.program,
        "avatar_url": target.avatar_url,
        "member_since": target.created_at.isoformat(),
        "post_count": post_count,
        "club_count": club_count,
        "follower_count": follower_count,
        "following_count": following_count,
        "is_following": is_following,
        "is_own_profile": target.id == current_user.id,
        "is_blocked": False,
        "username_changed_at": target.username_changed_at.isoformat() if target.username_changed_at else None,
    }


@router.get("/{username}/posts")
async def get_user_posts(
    username: str,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PostResponse]:
    target = await _get_visible_user(username, current_user, db)

    where = and_(
        Post.author_id == target.id,
        Post.post_type == "feed",
        Post.parent_post_id.is_(None),
        Post.is_deleted == False,
    )
    rows = (await db.execute(
        _build_post_select(where).order_by(Post.created_at.desc()).limit(limit)
    )).all()

    votes = await _user_votes([r[0].id for r in rows], current_user.id, db)
    return [_row_to_response(r, votes.get(r[0].id)) for r in rows]


@router.get("/{username}/clubs")
async def get_user_clubs(
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    target = await _get_visible_user(username, current_user, db)

    rows = (await db.execute(
        select(Club, ClubMember.role)
        .join(ClubMember, ClubMember.club_id == Club.id)
        .where(ClubMember.user_id == target.id)
        .order_by(ClubMember.joined_at.asc())
    )).all()

    return [
        {
            "id": str(club.id),
            "name": club.name,
            "slug": club.slug,
            "description": club.description,
            "banner_url": club.banner_url,
            "is_private": club.is_private,
            "role": role,
        }
        for club, role in rows
    ]


@router.delete("/me/followers/{username}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_follower(
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove someone from your followers list (force-unfollow you)."""
    follower = await _get_active_user(username, db)
    existing = (await db.execute(
        select(Follow).where(
            Follow.follower_id == follower.id,
            Follow.following_id == current_user.id,
        )
    )).scalar_one_or_none()
    if existing:
        await db.delete(existing)
        await db.commit()


@router.get("/{username}/followers")
async def get_followers(
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    target = await _get_visible_user(username, current_user, db)
    rows = (await db.execute(
        select(User)
        .join(Follow, Follow.follower_id == User.id)
        .where(Follow.following_id == target.id)
        .order_by(Follow.created_at.desc())
    )).scalars().all()
    return [{"username": u.username, "display_name": u.display_name, "avatar_url": u.avatar_url} for u in rows]


@router.get("/{username}/following")
async def get_following(
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    target = await _get_visible_user(username, current_user, db)
    rows = (await db.execute(
        select(User)
        .join(Follow, Follow.following_id == User.id)
        .where(Follow.follower_id == target.id)
        .order_by(Follow.created_at.desc())
    )).scalars().all()
    return [{"username": u.username, "display_name": u.display_name, "avatar_url": u.avatar_url} for u in rows]


@router.post("/{username}/follow", status_code=status.HTTP_204_NO_CONTENT)
async def follow_user(
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    target = await _get_visible_user(username, current_user, db)
    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot follow yourself.")

    existing = (await db.execute(
        select(Follow).where(
            Follow.follower_id == current_user.id,
            Follow.following_id == target.id,
        )
    )).scalar_one_or_none()

    if not existing:
        db.add(Follow(follower_id=current_user.id, following_id=target.id))
        existing_notif = (await db.execute(
            select(Notification).where(
                Notification.user_id == target.id,
                Notification.actor_id == current_user.id,
                Notification.type == "follow",
            )
        )).scalar_one_or_none()
        if existing_notif:
            existing_notif.is_read = False
            existing_notif.created_at = datetime.now(timezone.utc)
        else:
            db.add(Notification(user_id=target.id, actor_id=current_user.id, type="follow"))
        await db.commit()
        await push_live(db, target.id, {
            "type": "follow",
            "actor_username": current_user.username,
            "actor_display_name": current_user.display_name,
            "actor_avatar_url": current_user.avatar_url,
            # Muted category → bell only, no popup on the client.
            "silent": "follows" in (target.muted_notifications or []),
        })


@router.delete("/{username}/follow", status_code=status.HTTP_204_NO_CONTENT)
async def unfollow_user(
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    target = await _get_visible_user(username, current_user, db)

    existing = (await db.execute(
        select(Follow).where(
            Follow.follower_id == current_user.id,
            Follow.following_id == target.id,
        )
    )).scalar_one_or_none()

    if existing:
        await db.delete(existing)
        await db.commit()


class ReportRequest(BaseModel):
    reason: str = Field(min_length=10, max_length=500)


@router.post("/{username}/report", status_code=status.HTTP_201_CREATED)
async def report_user(
    username: str,
    body: ReportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    target = await _get_active_user(username, db)
    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot report yourself.")
    db.add(Report(
        reporter_id=current_user.id,
        reported_user_id=target.id,
        reason=body.reason.strip(),
    ))
    await db.commit()
    return {"ok": True}


# ── blocking ──────────────────────────────────────────────────────────────────

@router.get("/me/blocked")
async def list_blocked(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """People *you* blocked (not people who blocked you — that stays invisible)."""
    rows = (await db.execute(
        select(User, Block.created_at)
        .join(Block, Block.blocked_id == User.id)
        .where(Block.blocker_id == current_user.id)
        .order_by(Block.created_at.desc())
    )).all()
    return [
        {
            "username": u.username,
            "display_name": u.display_name,
            "avatar_url": u.avatar_url,
            "blocked_at": created_at.isoformat(),
        }
        for u, created_at in rows
    ]


@router.post("/{username}/block", status_code=status.HTTP_204_NO_CONTENT)
async def block_user(
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Block someone. Deliberately uses _get_active_user, not _get_visible_user: if."""
    target = await _get_active_user(username, db)
    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot block yourself.")

    existing = (await db.execute(
        select(Block).where(
            Block.blocker_id == current_user.id, Block.blocked_id == target.id
        )
    )).scalar_one_or_none()
    if existing:
        return  # idempotent

    db.add(Block(blocker_id=current_user.id, blocked_id=target.id))

    for follow in (await db.execute(
        select(Follow).where(or_(
            and_(Follow.follower_id == current_user.id, Follow.following_id == target.id),
            and_(Follow.follower_id == target.id, Follow.following_id == current_user.id),
        ))
    )).scalars().all():
        await db.delete(follow)

    for notif in (await db.execute(
        select(Notification).where(or_(
            and_(Notification.user_id == current_user.id, Notification.actor_id == target.id),
            and_(Notification.user_id == target.id, Notification.actor_id == current_user.id),
        ))
    )).scalars().all():
        await db.delete(notif)

    await db.commit()


@router.delete("/{username}/block", status_code=status.HTTP_204_NO_CONTENT)
async def unblock_user(
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Undo your own block."""
    target = await _get_active_user(username, db)

    existing = (await db.execute(
        select(Block).where(
            Block.blocker_id == current_user.id, Block.blocked_id == target.id
        )
    )).scalar_one_or_none()
    if existing:
        await db.delete(existing)
        await db.commit()
