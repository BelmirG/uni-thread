"""Session validity: one place that decides whether a login token still works.

A JWT's signature only proves we issued it. On top of that a token is dead if:
- the user logged out with it        (revocation list in Redis, until it expires)
- the password was reset since       (token "ver" claim != users.token_version)
- the account was banned or deleted  (is_active / row gone)

HTTP requests and every websocket go through user_from_token, and websockets
re-check it while open, so any of the above also ends live connections.
"""
import asyncio
import hashlib
import time
import uuid
from collections.abc import Awaitable, Callable

from fastapi import WebSocket
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import redis
from app.core.security import decode_access_claims
from app.database import AsyncSessionLocal
from app.models.user import User

SESSION_RECHECK_SECONDS = 30


def _revoked_key(token: str) -> str:
    return "revoked_token:" + hashlib.sha256(token.encode()).hexdigest()


async def revoke_token(token: str) -> None:
    """Kill one session (logout) for the rest of its natural lifetime."""
    claims = decode_access_claims(token)
    if not claims:
        return
    ttl = int(claims.get("exp", 0) - time.time())
    if ttl > 0:
        try:
            await redis.set(_revoked_key(token), "1", ex=ttl)
        except Exception:
            pass


async def _is_revoked(token: str) -> bool:
    # Fails open like the rate limiter: a Redis outage shouldn't log everyone out.
    try:
        return bool(await redis.exists(_revoked_key(token)))
    except Exception:
        return False


async def user_from_token(db: AsyncSession, token: str | None) -> User | None:
    """The live, active user behind a token — or None if the session is dead."""
    if not token:
        return None
    claims = decode_access_claims(token)
    if not claims:
        return None
    try:
        user_id = uuid.UUID(str(claims.get("sub", "")))
    except ValueError:
        return None
    if await _is_revoked(token):
        return None
    # populate_existing: long-lived websocket sessions keep this user in their
    # identity map, and without it a re-check would read the stale is_active.
    user = (await db.execute(
        select(User).where(User.id == user_id).execution_options(populate_existing=True)
    )).scalar_one_or_none()
    if not user or not user.is_active:
        return None
    if claims.get("ver", 0) != user.token_version:
        return None
    return user


async def watch_session(
    websocket: WebSocket,
    token: str,
    still_allowed: Callable[[AsyncSession, User], Awaitable[bool]] | None = None,
) -> None:
    """Runs beside a websocket; closes it once the session dies or access is lost
    (banned, logged out, password reset, removed from the club, blocked)."""
    while True:
        await asyncio.sleep(SESSION_RECHECK_SECONDS)
        async with AsyncSessionLocal() as db:
            user = await user_from_token(db, token)
            ok = user is not None and (still_allowed is None or await still_allowed(db, user))
        if not ok:
            try:
                await websocket.close(code=4001, reason="Session ended")
            except Exception:
                pass
            return
