"""Lightweight Redis-backed rate limiting.

Three ways to key a limit:
- rate_limit(request, ...)            — per client IP, for anonymous endpoints
- rate_limit_by(identity, ...)         — per account/email/anything, raises 429
- allow(key, identity, ...)            — same counter, returns bool (websockets)

Authenticated actions should key on the user, not the IP: campus Wi-Fi puts
many students behind one public address, and a per-IP limit there throttles
the whole lecture hall at once.
"""

import hashlib
import ipaddress

from fastapi import HTTPException
from starlette.requests import HTTPConnection

from app.core.redis import redis


def client_ip(conn: HTTPConnection) -> str:
    """The address that actually reached our edge — not the one the client claims.

    X-Forwarded-For grows left to right: whatever the client sent comes first,
    then each proxy appends the address it received the request from. So the
    leftmost entry is attacker-controlled (uvicorn's --forwarded-allow-ips="*"
    trusts it, which is why request.client can't be used for security), while
    the rightmost *public* entry is the one Railway's edge appended. Private
    hops to its right (the Next.js proxy, the platform network) are skipped.
    """
    raw = ",".join(conn.headers.getlist("x-forwarded-for"))
    hops = [h.strip() for h in raw.split(",") if h.strip()]
    for hop in reversed(hops):
        try:
            if ipaddress.ip_address(hop).is_global:
                return hop
        except ValueError:
            continue
    if hops:
        return hops[-1]
    return conn.client.host if conn.client else "unknown"


async def allow(key: str, identity: str, *, limit: int, window_seconds: int) -> bool:
    """Count one event; False once `limit` is exceeded in the window. Fails open."""
    redis_key = f"ratelimit:{key}:{identity}"
    try:
        count = await redis.incr(redis_key)
        if count == 1:
            await redis.expire(redis_key, window_seconds)
    except Exception:
        return True
    return count <= limit


def _too_many() -> HTTPException:
    return HTTPException(
        status_code=429,
        detail="Too many attempts. Please wait a moment and try again.",
    )


async def rate_limit(request: HTTPConnection, *, key: str, limit: int, window_seconds: int) -> None:
    if not await allow(key, client_ip(request), limit=limit, window_seconds=window_seconds):
        raise _too_many()


async def rate_limit_by(identity: object, *, key: str, limit: int, window_seconds: int) -> None:
    """Limit by an arbitrary identity (user id, email). Emails are hashed so
    addresses never sit in Redis in plain text."""
    ident = str(identity)
    if "@" in ident:
        ident = hashlib.sha256(ident.lower().encode()).hexdigest()[:32]
    if not await allow(key, ident, limit=limit, window_seconds=window_seconds):
        raise _too_many()
