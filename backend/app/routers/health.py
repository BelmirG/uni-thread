from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.database import get_db

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    try:
        await db.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception:
        db_status = "error"

    return {"status": "ok", "database": db_status}


# TEMPORARY — shows which forwarding headers the hosting proxy sets, so the
# rate limiter can key on one the client can't forge. Echoes only the caller's
# own request metadata. Remove once client_ip() is settled.
_DIAG_HEADERS = (
    "x-forwarded-for", "x-real-ip", "forwarded", "x-envoy-external-address",
    "cf-connecting-ip", "true-client-ip", "x-railway-edge", "x-forwarded-host",
)


@router.get("/health/request-meta")
async def request_meta(request: Request):
    from app.core.rate_limit import client_ip
    return {
        "peer": request.scope.get("client"),
        "headers": {h: request.headers.getlist(h) for h in _DIAG_HEADERS if h in request.headers},
        "derived_client_ip": client_ip(request),
    }
