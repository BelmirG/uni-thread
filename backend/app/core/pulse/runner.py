"""Step 3: run reports in the background — on demand from /admin, or weekly on schedule.

A run can take minutes on a local model, so the database session is closed
while the LLM works (no transaction or pooled connection held open), and a
Redis lock guarantees only one report generates at a time.
"""
import asyncio
import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select, update

from app.config import settings
from app.core.pulse.collect import collect_week, last_completed_week
from app.core.pulse.llm import OllamaLLM, PulseLLM
from app.core.pulse.pipeline import build_report
from app.core.redis import redis
from app.database import AsyncSessionLocal
from app.models.pulse_report import PulseReport

logger = logging.getLogger(__name__)

LOCK_KEY = "pulse:running"
LOCK_SECONDS = 3 * 3600
SCHEDULER_INTERVAL = 30 * 60
_tasks: set[asyncio.Task] = set()


def default_llm() -> OllamaLLM:
    return OllamaLLM(settings.pulse_llm_url, settings.pulse_llm_model)


async def running_week() -> str | None:
    try:
        value = await redis.get(LOCK_KEY)
    except Exception:
        return None
    return value.decode() if isinstance(value, bytes) else value


async def run_report(week_start: date, llm: PulseLLM | None = None) -> None:
    llm = llm or default_llm()
    now = lambda: datetime.now(timezone.utc)  # noqa: E731

    async with AsyncSessionLocal() as db:
        row = (await db.execute(
            select(PulseReport).where(PulseReport.week_start == week_start)
        )).scalar_one_or_none()
        if row is None:
            row = PulseReport(week_start=week_start, model=llm.name)
            db.add(row)
        row.status, row.model, row.report, row.stats, row.error = "running", llm.name, None, None, None
        row.started_at, row.finished_at = now(), None
        await db.commit()
        row_id = row.id

    status, report, stats, error = "done", None, None, None
    try:
        # Read everything needed, then let go of the DB before the slow LLM work.
        async with AsyncSessionLocal() as db:
            collected = await collect_week(db, week_start)
            previous = (await db.execute(
                select(PulseReport.report).where(
                    PulseReport.week_start == week_start - timedelta(days=7),
                    PulseReport.status == "done",
                )
            )).scalar_one_or_none()
        report, stats = await build_report(
            llm, collected, week_start, previous,
            min_students=settings.pulse_min_students, chunk=settings.pulse_chunk_size,
        )
    except Exception as exc:  # report the failure in the UI instead of hanging on "running"
        logger.exception("Campus Pulse report for %s failed", week_start)
        status, error = "failed", str(exc)[:500]

    # Session 2: store the result.
    async with AsyncSessionLocal() as db:
        await db.execute(
            update(PulseReport).where(PulseReport.id == row_id).values(
                status=status, report=report, stats=stats, error=error, finished_at=now(),
            )
        )
        await db.commit()


async def start_generation(week_start: date, llm: PulseLLM | None = None) -> bool:
    """Start a report in the background. False if another report is already running."""
    try:
        if not await redis.set(LOCK_KEY, week_start.isoformat(), nx=True, ex=LOCK_SECONDS):
            return False
    except Exception:
        logger.warning("Redis unavailable; starting Campus Pulse without a lock")

    async def _job():
        try:
            await run_report(week_start, llm)
        finally:
            try:
                await redis.delete(LOCK_KEY)
            except Exception:
                pass

    task = asyncio.create_task(_job())
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return True


async def _recover_interrupted() -> None:
    """A restart kills any in-flight job; don't leave it stuck on "running"."""
    try:
        await redis.delete(LOCK_KEY)
    except Exception:
        pass
    async with AsyncSessionLocal() as db:
        await db.execute(
            update(PulseReport).where(PulseReport.status == "running").values(
                status="failed", error="Interrupted (server restarted) — generate again.",
                finished_at=datetime.now(timezone.utc),
            )
        )
        await db.commit()


async def scheduler_loop() -> None:
    """Every 30 minutes: if last week has no report yet, generate it. Failed weeks
    are left for a manual retry from /admin rather than retried in a loop."""
    await _recover_interrupted()
    while True:
        try:
            week = last_completed_week()
            async with AsyncSessionLocal() as db:
                exists = (await db.execute(
                    select(PulseReport.id).where(PulseReport.week_start == week)
                )).first()
            if not exists:
                await start_generation(week)
        except Exception:
            logger.exception("Campus Pulse scheduler tick failed")
        await asyncio.sleep(SCHEDULER_INTERVAL)


def start_scheduler() -> None:
    if settings.pulse_enabled:
        task = asyncio.create_task(scheduler_loop())
        _tasks.add(task)
        task.add_done_callback(_tasks.discard)
