"""Campus Pulse admin API (campus-pulse branch only).

Admin-only. When PULSE_ENABLED is off every route answers 404, so the feature
is invisible rather than merely locked.
"""
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.pulse import runner
from app.core.pulse.collect import last_completed_week
from app.database import get_db
from app.dependencies import get_current_admin
from app.models.admin_action import AdminAction
from app.models.pulse_report import PulseReport
from app.models.user import User

router = APIRouter(prefix="/api/admin/pulse", tags=["pulse"])


def _enabled() -> None:
    if not settings.pulse_enabled:
        raise HTTPException(status_code=404, detail="Not found.")


def _summary(r: PulseReport) -> dict:
    return {
        "week_start": r.week_start.isoformat(),
        "status": r.status,
        "model": r.model,
        "started_at": r.started_at.isoformat() if r.started_at else None,
        "finished_at": r.finished_at.isoformat() if r.finished_at else None,
        "error": r.error,
    }


@router.get("/status", dependencies=[Depends(_enabled)])
async def pulse_status(_: User = Depends(get_current_admin)):
    llm = runner.default_llm()
    return {
        "model": settings.pulse_llm_model,
        "llm": await llm.status(),
        "running_week": await runner.running_week(),
        "last_completed_week": last_completed_week().isoformat(),
        "min_students": settings.pulse_min_students,
    }


@router.get("/reports", dependencies=[Depends(_enabled)])
async def list_reports(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_admin)):
    rows = (await db.execute(
        select(PulseReport).order_by(PulseReport.week_start.desc()).limit(52)
    )).scalars().all()
    return [_summary(r) for r in rows]


@router.get("/reports/{week_start}", dependencies=[Depends(_enabled)])
async def get_report(week_start: date, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_admin)):
    row = (await db.execute(
        select(PulseReport).where(PulseReport.week_start == week_start)
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="No report for that week.")
    report = dict(row.report or {})
    # Full ranked lists exist for next week's trend calculation; the page only needs the top 5.
    report.pop("topics_all", None)
    report.pop("complaints_all", None)
    return {**_summary(row), "report": report or None, "stats": row.stats}


class GenerateRequest(BaseModel):
    week_start: date | None = None   # a Monday; default = the last completed week


@router.post("/generate", status_code=status.HTTP_202_ACCEPTED, dependencies=[Depends(_enabled)])
async def generate(
    body: GenerateRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    week = body.week_start or last_completed_week()
    if week.weekday() != 0:
        raise HTTPException(status_code=422, detail="week_start must be a Monday.")
    if week + timedelta(days=7) > datetime.now(timezone.utc).date():
        raise HTTPException(status_code=422, detail="That week hasn't finished yet.")
    if not await runner.start_generation(week):
        raise HTTPException(status_code=409, detail="A report is already being generated. Try again when it finishes.")
    db.add(AdminAction(
        actor_id=admin.id, actor_username=admin.username,
        action="generate_pulse_report", target_type="pulse", target_label=week.isoformat(),
    ))
    await db.commit()
    return {"ok": True, "week_start": week.isoformat(), "status": "running"}
