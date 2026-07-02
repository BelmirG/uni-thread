"""Lightweight Redis-backed rate limiting.

Uses a fixed-window counter: the first request in a window sets a key with a TTL,
each subsequent request increments it, and once the count passes the limit we reject
with 429 until the window expires. Redis is already a dependency (chat/pub-sub), so
this needs no new packages or paid service. If Redis is unavailable we fail open —
a login form staying up matters more than perfect limiting for a campus app.
"""

from fastapi import HTTPException, Request

from app.core.redis import redis


async def rate_limit(request: Request, *, key: str, limit: int, window_seconds: int) -> None:
    client = request.client.host if request.client else "unknown"
    redis_key = f"ratelimit:{key}:{client}"
    try:
        count = await redis.incr(redis_key)
        if count == 1:
            await redis.expire(redis_key, window_seconds)
    except Exception:
        return  # fail open: never let a limiter outage lock users out
    if count > limit:
        raise HTTPException(
            status_code=429,
            detail="Too many attempts. Please wait a moment and try again.",
        )
