"""Browser push (Web Push / VAPID) delivery."""
import asyncio
import base64
import json
import logging

from pywebpush import WebPushException, webpush
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.push_subscription import PushSubscription

logger = logging.getLogger(__name__)

_raw_private_key: str | None = None


def _private_key() -> str:
    """pywebpush wants the raw base64url EC key; the env stores base64(PEM)."""
    global _raw_private_key
    if _raw_private_key is None:
        from cryptography.hazmat.primitives import serialization
        from py_vapid import b64urlencode

        pem = base64.b64decode(settings.vapid_private_key)
        key = serialization.load_pem_private_key(pem, password=None)
        _raw_private_key = b64urlencode(key.private_numbers().private_value.to_bytes(32, "big"))
    return _raw_private_key


async def send_web_push(db: AsyncSession, user_id, payload: dict) -> None:
    """Push `payload` to every browser this user enabled notifications in."""
    if not settings.push_configured or payload.get("silent"):
        return
    subs = list((await db.execute(
        select(PushSubscription).where(PushSubscription.user_id == user_id)
    )).scalars())
    if not subs:
        return

    data = json.dumps(payload)
    dead: list[PushSubscription] = []
    for sub in subs:
        try:
            await asyncio.to_thread(
                webpush,
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=data,
                vapid_private_key=_private_key(),
                vapid_claims={"sub": settings.vapid_subject},
                ttl=86400,
            )
        except WebPushException as exc:
            code = getattr(getattr(exc, "response", None), "status_code", None)
            if code in (404, 410):
                dead.append(sub)
            else:
                logger.warning("web push to %s… failed: %s", sub.endpoint[:60], exc)
        except Exception as exc:
            logger.warning("web push error: %s", exc)

    for sub in dead:
        await db.delete(sub)
    if dead:
        await db.commit()
