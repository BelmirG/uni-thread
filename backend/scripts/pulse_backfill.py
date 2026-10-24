#!/usr/bin/env python
"""Generate Campus Pulse reports for past weeks, oldest first (so trends work).

Holds the same Redis lock as on-demand/scheduled runs, so the backend's weekly
scheduler can't start a competing report on the shared local model meanwhile,
and the admin page shows which week is generating.

    docker compose exec backend python scripts/pulse_backfill.py            # last 6 weeks
    docker compose exec backend python scripts/pulse_backfill.py --weeks 3
"""
import asyncio
import sys
from datetime import timedelta

sys.path.insert(0, "/app")

from sqlalchemy import select

from app.core.pulse.collect import last_completed_week
from app.core.pulse.runner import LOCK_KEY, LOCK_SECONDS, default_llm, run_report
from app.core.redis import redis
from app.database import AsyncSessionLocal
from app.models.pulse_report import PulseReport


async def main(weeks: int) -> None:
    llm = default_llm()
    status = await llm.status()
    if not status["model_available"]:
        sys.exit(f"Model not available at the LLM endpoint ({llm.name}): {status}")
    last = last_completed_week()
    first = last - timedelta(weeks=weeks - 1)
    if not await redis.set(LOCK_KEY, first.isoformat(), nx=True, ex=LOCK_SECONDS):
        sys.exit("Another Campus Pulse report is generating right now; try again when it finishes.")
    try:
        for i in range(weeks - 1, -1, -1):
            week = last - timedelta(weeks=i)
            await redis.set(LOCK_KEY, week.isoformat(), ex=LOCK_SECONDS)
            print(f"Week of {week}: generating…", flush=True)
            await run_report(week, llm)
            async with AsyncSessionLocal() as db:
                row = (await db.execute(select(PulseReport).where(PulseReport.week_start == week))).scalar_one()
            if row.status != "done":
                print(f"  FAILED: {row.error}", flush=True)
                continue
            s, r = row.stats, row.report
            print(f"  {s['posts_analyzed']} posts, {s['students']} students, {s['llm_calls']} LLM calls, "
                  f"{s['duration_seconds']}s, redactions={s['redactions']}", flush=True)
            for t in r["topics"]:
                print(f"  topic {t['rank']}: {t['name']} ({t['students']} students, {t['mood']}, {t['trend']})", flush=True)
            for c in r["complaints"]:
                print(f"  complaint {c['rank']}: {c['problem']} [{c['area']}] ({c['students']} students, {c['trend']})", flush=True)
            if r.get("complaint_topics"):
                print(f"  mainly complaints: {', '.join(r['complaint_topics'])}", flush=True)
    finally:
        await redis.delete(LOCK_KEY)


if __name__ == "__main__":
    n = int(sys.argv[sys.argv.index("--weeks") + 1]) if "--weeks" in sys.argv else 6
    asyncio.run(main(n))
