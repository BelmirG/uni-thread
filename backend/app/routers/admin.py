from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Security
from fastapi.security import APIKeyHeader
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy.orm import aliased

from app.config import settings
from app.database import get_db
from app.models.report import Report
from app.models.user import User

router = APIRouter(prefix="/api/admin", tags=["admin"])

_api_key_header = APIKeyHeader(name="x-admin-key", auto_error=False)


def _verify_admin_key(key: str = Security(_api_key_header)):
    if key != settings.admin_key:
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
