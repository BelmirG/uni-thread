"""Lightweight Redis-backed rate limiting."""

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
        return
    if count > limit:
        raise HTTPException(
            status_code=429,
            detail="Too many attempts. Please wait a moment and try again.",
        )
