import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Security
from fastapi.security import APIKeyHeader
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy.orm import aliased

from app.config import settings
from app.database import get_db
from app.models.club import Club
from app.models.post import Post
from app.models.report import Report
from app.models.user import User

router = APIRouter(prefix="/api/admin", tags=["admin"])

_api_key_header = APIKeyHeader(name="x-admin-key", auto_error=False)


def _verify_admin_key(key: str = Security(_api_key_header)):
    # Constant-time compare so an attacker can't recover the key byte-by-byte
    # from response timing.
    if not key or not secrets.compare_digest(key, settings.admin_key):
        raise HTTPException(status_code=403, detail="Invalid admin key.")


class BanRequest(BaseModel):
    reason: str


async def _get_user(username: str, db: AsyncSession) -> User:
    user = (await db.execute(
        select(User).where(User.username == username)
    )).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return user


def _user_summary(u: User) -> dict:
    return {
        "username": u.username,
        "email": u.email,
        "display_name": u.display_name,
        "avatar_url": u.avatar_url,
        "faculty": u.faculty,
        "is_email_verified": u.is_email_verified,
        "is_active": u.is_active,
        "is_admin": u.is_admin,
        "is_banned": (not u.is_active) and u.ban_reason is not None,
        "ban_reason": u.ban_reason,
        "created_at": u.created_at.isoformat(),
    }


@router.get("/users")
async def list_users(
    q: str = "",
    filter: str = "all",  # all | unverified | banned | admins
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(_verify_admin_key),
):
    """Browse/search accounts for moderation. Newest first."""
    conditions = []
    q = q.strip()
    if q:
        pattern = f"%{q}%"
        conditions.append(or_(
            User.username.ilike(pattern),
            User.email.ilike(pattern),
            User.display_name.ilike(pattern),
        ))
    if filter == "unverified":
        conditions.append(User.is_email_verified == False)  # noqa: E712
    elif filter == "banned":
        conditions.append(User.is_active == False)  # noqa: E712
    elif filter == "admins":
        conditions.append(User.is_admin == True)  # noqa: E712

    stmt = select(User)
    for c in conditions:
        stmt = stmt.where(c)
    stmt = stmt.order_by(User.created_at.desc()).limit(min(limit, 200))
    users = (await db.execute(stmt)).scalars().all()
    return [_user_summary(u) for u in users]


@router.post("/users/{username}/verify")
async def verify_user(
    username: str,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(_verify_admin_key),
):
    """Manually confirm an account whose verification email got stuck."""
    user = await _get_user(username, db)
    if user.is_email_verified:
        raise HTTPException(status_code=400, detail="Account is already verified.")
    user.is_email_verified = True
    user.email_verification_token = None
    user.email_verification_expires_at = None
    await db.commit()
    return {"ok": True, "username": username}


@router.delete("/users/{username}", status_code=200)
async def delete_user(
    username: str,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(_verify_admin_key),
):
    """Permanently delete an account. Their votes, follows, memberships, messages,
    and anonymous-authorship links cascade away; their posts are kept but detached
    (author set to null). Refuses if the user still owns clubs, because a club's
    creator can't be null — reassign or remove those clubs first."""
    user = await _get_user(username, db)
    if user.is_admin:
        raise HTTPException(status_code=400, detail="Cannot delete an admin account.")

    owned = (await db.execute(
        select(Club.name).where(Club.created_by == user.id)
    )).scalars().all()
    if owned:
        raise HTTPException(
            status_code=409,
            detail=f"User owns club(s): {', '.join(owned)}. Reassign or delete them first.",
        )

    await db.delete(user)
    await db.commit()
    return {"ok": True, "username": username}


@router.post("/users/{username}/ban")
async def ban_user(
    username: str,
    body: BanRequest,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(_verify_admin_key),
):
    user = await _get_user(username, db)
    if not user.is_active:
        raise HTTPException(status_code=400, detail="User is already banned.")
    user.is_active = False
    user.ban_reason = body.reason.strip()
    user.banned_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True, "username": username, "ban_reason": user.ban_reason}


@router.post("/users/{username}/unban")
async def unban_user(
    username: str,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(_verify_admin_key),
):
    user = await _get_user(username, db)
    if user.is_active:
        raise HTTPException(status_code=400, detail="User is not banned.")
    user.is_active = True
    user.ban_reason = None
    user.banned_at = None
    await db.commit()
    return {"ok": True, "username": username}


@router.get("/reports")
async def list_reports(
    status: str = "pending",
    db: AsyncSession = Depends(get_db),
    _: str = Depends(_verify_admin_key),
):
    Reporter = aliased(User)
    Reported = aliased(User)
    rows = (await db.execute(
        select(Report, Reporter, Reported)
        .join(Reporter, Reporter.id == Report.reporter_id)
        .join(Reported, Reported.id == Report.reported_user_id)
        .where(Report.status == status)
        .order_by(Report.created_at.desc())
        .limit(100)
    )).all()
    return [
        {
            "id": str(r.id),
            "reporter": reporter.username,
            "reported_user": reported.username,
            "reported_display_name": reported.display_name,
            "reason": r.reason,
            "status": r.status,
            "created_at": r.created_at.isoformat(),
        }
        for r, reporter, reported in rows
    ]


@router.post("/reports/{report_id}/dismiss")
async def dismiss_report(
    report_id: str,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(_verify_admin_key),
):
    report = (await db.execute(
        select(Report).where(Report.id == report_id)
    )).scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")
    report.status = "dismissed"
    await db.commit()
    return {"ok": True}


@router.get("/users/{username}")
async def get_user_info(
    username: str,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(_verify_admin_key),
):
    user = await _get_user(username, db)
    return {
        "username": user.username,
        "email": user.email,
        "display_name": user.display_name,
        "is_active": user.is_active,
        "is_banned": not user.is_active and user.ban_reason is not None,
        "ban_reason": user.ban_reason,
        "banned_at": user.banned_at.isoformat() if user.banned_at else None,
        "created_at": user.created_at.isoformat(),
    }


# ── posts ─────────────────────────────────────────────────────────────────────

@router.get("/posts")
async def list_posts(
    q: str = "",
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(_verify_admin_key),
):
    """Browse/search posts (any type) to find something to remove. Newest first.
    Anonymous Q&A posts are shown without an author — admins de-anonymize through a
    separate audited endpoint, never here."""
    Author = aliased(User)
    stmt = (
        select(Post, Author)
        .outerjoin(Author, Author.id == Post.author_id)
        .order_by(Post.created_at.desc())
        .limit(min(limit, 200))
    )
    q = q.strip()
    if q:
        stmt = stmt.where(Post.content.ilike(f"%{q}%"))
    rows = (await db.execute(stmt)).all()
    return [
        {
            "id": str(p.id),
            "content": p.content,
            "post_type": p.post_type,
            "is_deleted": p.is_deleted,
            "is_anonymous": p.is_anonymous,
            "author": None if (p.is_anonymous or author is None) else author.username,
            "created_at": p.created_at.isoformat(),
        }
        for p, author in rows
    ]


@router.delete("/posts/{post_id}", status_code=200)
async def delete_post(
    post_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(_verify_admin_key),
):
    """Soft-delete any post (sets is_deleted). Content stays in the database for the
    audit trail but is hidden from all user-facing views."""
    post = (await db.execute(select(Post).where(Post.id == post_id))).scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found.")
    if post.is_deleted:
        raise HTTPException(status_code=400, detail="Post is already deleted.")
    post.is_deleted = True
    await db.commit()
    return {"ok": True, "id": str(post_id)}
