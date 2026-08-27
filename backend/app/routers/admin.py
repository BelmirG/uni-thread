import re
import secrets
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, Security
from fastapi.responses import FileResponse
from fastapi.security import APIKeyHeader
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy.orm import aliased

from app.config import settings
from app.core.rate_limit import rate_limit
from app.database import get_db
from app.dependencies import get_current_admin
from app.models.admin_action import AdminAction
from app.models.club import Club
from app.models.club_member import ClubMember
from app.models.post import Post
from app.models.report import Report
from app.models.user import User

router = APIRouter(prefix="/api/admin", tags=["admin"])

_api_key_header = APIKeyHeader(name="x-admin-key", auto_error=False)


async def _verify_admin_key(request: Request, key: str = Security(_api_key_header)):
    """Break-glass credential — used only to bootstrap the first admin account or."""
    if not key or not secrets.compare_digest(key, settings.admin_key):
        await rate_limit(request, key="admin_key_fail", limit=10, window_seconds=3600)
        raise HTTPException(status_code=403, detail="Invalid admin key.")


async def _log_action(
    db: AsyncSession,
    actor: User,
    action: str,
    target_type: str,
    target_label: str,
    detail: str | None = None,
) -> None:
    db.add(AdminAction(
        actor_id=actor.id,
        actor_username=actor.username,
        action=action,
        target_type=target_type,
        target_label=target_label,
        detail=detail,
    ))


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


# ── bootstrap ─────────────────────────────────────────────────────────────────

@router.post("/bootstrap/{username}")
async def bootstrap_admin(
    username: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_verify_admin_key),
):
    """Grant is_admin using the master key instead of an existing admin account."""
    user = await _get_user(username, db)
    if user.is_admin:
        raise HTTPException(status_code=400, detail="User is already an admin.")
    user.is_admin = True
    db.add(AdminAction(
        actor_id=None,
        actor_username="(admin key)",
        action="bootstrap_admin",
        target_type="user",
        target_label=username,
    ))
    await db.commit()
    return {"ok": True, "username": username}


# ── overview ──────────────────────────────────────────────────────────────────

@router.get("/stats")
async def get_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    total_users = (await db.execute(select(func.count(User.id)))).scalar_one()
    banned_users = (await db.execute(
        select(func.count(User.id)).where(User.is_active == False)  # noqa: E712
    )).scalar_one()
    admin_count = (await db.execute(
        select(func.count(User.id)).where(User.is_admin == True)  # noqa: E712
    )).scalar_one()
    unverified = (await db.execute(
        select(func.count(User.id)).where(User.is_email_verified == False)  # noqa: E712
    )).scalar_one()
    total_posts = (await db.execute(
        select(func.count(Post.id)).where(Post.is_deleted == False)  # noqa: E712
    )).scalar_one()
    total_clubs = (await db.execute(select(func.count(Club.id)))).scalar_one()
    pending_reports = (await db.execute(
        select(func.count(Report.id)).where(Report.status == "pending")
    )).scalar_one()
    return {
        "total_users": total_users,
        "banned_users": banned_users,
        "admin_count": admin_count,
        "unverified_users": unverified,
        "total_posts": total_posts,
        "total_clubs": total_clubs,
        "pending_reports": pending_reports,
    }


@router.get("/actions")
async def list_actions(
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """The audit trail: every moderation action taken through this panel, newest."""
    stmt = select(AdminAction).order_by(AdminAction.created_at.desc()).limit(min(limit, 300))
    rows = (await db.execute(stmt)).scalars().all()
    return [
        {
            "id": str(a.id),
            "actor_username": a.actor_username,
            "action": a.action,
            "target_type": a.target_type,
            "target_label": a.target_label,
            "detail": a.detail,
            "created_at": a.created_at.isoformat(),
        }
        for a in rows
    ]


# ── users ─────────────────────────────────────────────────────────────────────

@router.get("/users")
async def list_users(
    q: str = "",
    filter: str = "all",  # all | unverified | banned | admins
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
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
    admin: User = Depends(get_current_admin),
):
    """Manually confirm an account whose verification email got stuck."""
    user = await _get_user(username, db)
    if user.is_email_verified:
        raise HTTPException(status_code=400, detail="Account is already verified.")
    user.is_email_verified = True
    user.email_verification_token = None
    user.email_verification_expires_at = None
    await _log_action(db, admin, "verify_user", "user", username)
    await db.commit()
    return {"ok": True, "username": username}


@router.delete("/users/{username}", status_code=200)
async def delete_user(
    username: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Permanently delete an account."""
    user = await _get_user(username, db)
    if user.is_admin:
        raise HTTPException(status_code=400, detail="Cannot delete an admin account.")

    owned_clubs = (await db.execute(
        select(Club).where(Club.created_by == user.id)
    )).scalars().all()
    succession: list[dict] = []
    for club in owned_clubs:
        heir = (await db.execute(
            select(ClubMember)
            .where(ClubMember.club_id == club.id, ClubMember.user_id != user.id)
            .order_by((ClubMember.role != "moderator").asc(), ClubMember.joined_at.asc())
            .limit(1)
        )).scalar_one_or_none()
        if heir:
            heir.role = "owner"
            club.created_by = heir.user_id
            succession.append({"club": club.name, "action": "ownership transferred"})
        else:
            await db.delete(club)
            succession.append({"club": club.name, "action": "deleted (no other members)"})

    await _log_action(
        db, admin, "delete_user", "user", username,
        detail=f"clubs affected: {succession}" if succession else None,
    )
    await db.delete(user)
    await db.commit()
    return {"ok": True, "username": username, "clubs": succession}


@router.post("/users/{username}/ban")
async def ban_user(
    username: str,
    body: BanRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    user = await _get_user(username, db)
    if not user.is_active:
        raise HTTPException(status_code=400, detail="User is already banned.")
    if user.is_admin:
        raise HTTPException(status_code=400, detail="Cannot ban an admin account.")
    user.is_active = False
    user.ban_reason = body.reason.strip()
    user.banned_at = datetime.now(timezone.utc)
    await _log_action(db, admin, "ban_user", "user", username, detail=user.ban_reason)
    await db.commit()
    return {"ok": True, "username": username, "ban_reason": user.ban_reason}


@router.post("/users/{username}/unban")
async def unban_user(
    username: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    user = await _get_user(username, db)
    if user.is_active:
        raise HTTPException(status_code=400, detail="User is not banned.")
    user.is_active = True
    user.ban_reason = None
    user.banned_at = None
    await _log_action(db, admin, "unban_user", "user", username)
    await db.commit()
    return {"ok": True, "username": username}


@router.get("/users/{username}")
async def get_user_info(
    username: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    user = await _get_user(username, db)
    return {
        "username": user.username,
        "email": user.email,
        "display_name": user.display_name,
        "is_active": user.is_active,
        "is_admin": user.is_admin,
        "is_banned": not user.is_active and user.ban_reason is not None,
        "ban_reason": user.ban_reason,
        "banned_at": user.banned_at.isoformat() if user.banned_at else None,
        "created_at": user.created_at.isoformat(),
    }


# ── admin roles ───────────────────────────────────────────────────────────────

@router.post("/users/{username}/promote")
async def promote_user(
    username: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Grant another account admin access."""
    user = await _get_user(username, db)
    if user.is_admin:
        raise HTTPException(status_code=400, detail="User is already an admin.")
    user.is_admin = True
    await _log_action(db, admin, "promote_admin", "user", username)
    await db.commit()
    return {"ok": True, "username": username}


@router.post("/users/{username}/demote")
async def demote_user(
    username: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Revoke another admin's access."""
    if username == admin.username:
        raise HTTPException(status_code=400, detail="You can't remove your own admin access.")
    user = await _get_user(username, db)
    if not user.is_admin:
        raise HTTPException(status_code=400, detail="User is not an admin.")
    user.is_admin = False
    await _log_action(db, admin, "demote_admin", "user", username)
    await db.commit()
    return {"ok": True, "username": username}


# ── reports ───────────────────────────────────────────────────────────────────

@router.get("/reports")
async def list_reports(
    status: str = "pending",
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    Reporter = aliased(User)
    Reported = aliased(User)
    rows = (await db.execute(
        select(Report, Reporter, Reported, Post)
        .join(Reporter, Reporter.id == Report.reporter_id)
        .outerjoin(Reported, Reported.id == Report.reported_user_id)
        .outerjoin(Post, Post.id == Report.reported_post_id)
        .where(Report.status == status)
        .order_by(Report.created_at.desc())
        .limit(100)
    )).all()
    return [
        {
            "id": str(r.id),
            "type": "post" if r.reported_post_id else "user",
            "reporter": reporter.username,
            "reported_user": reported.username if reported else None,
            "reported_display_name": reported.display_name if reported else None,
            "post_id": str(post.id) if post else None,
            "post_type": post.post_type if post else None,
            "post_snippet": (post.content or "")[:200] if post else None,
            "post_deleted": post.is_deleted if post else None,
            "reason": r.reason,
            "status": r.status,
            "created_at": r.created_at.isoformat(),
        }
        for r, reporter, reported, post in rows
    ]


@router.post("/reports/{report_id}/dismiss")
async def dismiss_report(
    report_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    report = (await db.execute(
        select(Report).where(Report.id == report_id)
    )).scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")
    report.status = "dismissed"
    await _log_action(db, admin, "dismiss_report", "report", report_id)
    await db.commit()
    return {"ok": True}


# ── posts ─────────────────────────────────────────────────────────────────────

@router.get("/posts")
async def list_posts(
    q: str = "",
    limit: int = 50,
    deleted: bool = False,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """Browse/search posts (any type) to find something to remove."""
    Author = aliased(User)
    stmt = (
        select(Post, Author)
        .outerjoin(Author, Author.id == Post.author_id)
        .where(Post.is_deleted == deleted)
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
    admin: User = Depends(get_current_admin),
):
    """Soft-delete any post (sets is_deleted)."""
    post = (await db.execute(select(Post).where(Post.id == post_id))).scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found.")
    if post.is_deleted:
        raise HTTPException(status_code=400, detail="Post is already deleted.")
    post.is_deleted = True
    await _log_action(
        db, admin, "delete_post", "post", str(post_id),
        detail=(post.content or "")[:200] or None,
    )
    await db.commit()
    return {"ok": True, "id": str(post_id)}


# ── clubs ─────────────────────────────────────────────────────────────────────

@router.get("/clubs")
async def list_clubs(
    q: str = "",
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """Browse/search clubs, with a live member count, to find one to remove."""
    stmt = (
        select(Club, func.count(ClubMember.user_id))
        .outerjoin(ClubMember, ClubMember.club_id == Club.id)
        .group_by(Club.id)
        .order_by(Club.created_at.desc())
        .limit(min(limit, 200))
    )
    q = q.strip()
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(or_(Club.name.ilike(pattern), Club.slug.ilike(pattern)))
    rows = (await db.execute(stmt)).all()
    return [
        {
            "id": str(club.id),
            "name": club.name,
            "slug": club.slug,
            "is_private": club.is_private,
            "member_count": member_count,
            "created_at": club.created_at.isoformat(),
        }
        for club, member_count in rows
    ]


@router.delete("/clubs/{slug}", status_code=200)
async def delete_club(
    slug: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Permanently delete a club — memberships, join requests, invitations, and chat."""
    club = (await db.execute(select(Club).where(Club.slug == slug))).scalar_one_or_none()
    if not club:
        raise HTTPException(status_code=404, detail="Club not found.")
    await _log_action(db, admin, "delete_club", "club", club.slug, detail=club.name)
    await db.delete(club)
    await db.commit()
    return {"ok": True, "slug": slug}


MEDIA_DIRS = {
    "uploads": Path(settings.data_dir) / "uploads",      # images, video, thumbnails
    "filestore": Path(settings.data_dir) / "filestore",  # documents
}

_SAFE_MEDIA_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")


@router.get("/media/manifest")
async def media_manifest(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_verify_admin_key),
):
    """Every file currently on the media volume, with sizes so the caller can verify."""
    files = []
    total = 0
    for kind, directory in MEDIA_DIRS.items():
        if not directory.is_dir():
            continue
        for entry in sorted(directory.iterdir()):
            if not entry.is_file():
                continue
            size = entry.stat().st_size
            total += size
            files.append({"kind": kind, "name": entry.name, "size": size})

    db.add(AdminAction(
        actor_id=None,
        actor_username="(admin key)",
        action="media_manifest",
        target_type="media",
        target_label=f"{len(files)} files",
        detail=f"{total} bytes",
    ))
    await db.commit()

    return {"files": files, "count": len(files), "total_bytes": total}


@router.get("/media/file/{kind}/{name}")
async def media_file(kind: str, name: str, _: None = Depends(_verify_admin_key)):
    """Stream one file off the media volume for backup."""
    directory = MEDIA_DIRS.get(kind)
    if directory is None:
        raise HTTPException(status_code=404, detail="Unknown media directory.")
    if not _SAFE_MEDIA_NAME.match(name) or Path(name).name != name:
        raise HTTPException(status_code=400, detail="Invalid file name.")

    path = (directory / name).resolve()
    if not path.is_file() or directory.resolve() not in path.parents:
        raise HTTPException(status_code=404, detail="File not found.")

    return FileResponse(path, media_type="application/octet-stream", filename=name)
