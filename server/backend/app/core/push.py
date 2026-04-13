"""Web Push notification service.

VAPID key auto-generation (D-12) and push dispatch (NOTF-01, NOTF-02).
"""

import asyncio
import json
import logging
from datetime import timedelta

from pywebpush import webpush, WebPushException
from py_vapid import Vapid
from sqlmodel import Session as DBSession, select

from app.core.config import settings
from app.core.db import engine
from app.core.security import create_access_token
from app.models import PushSubscription

logger = logging.getLogger(__name__)


_vapid_cache: tuple[str, str] | None = None
_vapid_lock = asyncio.Lock()


def ensure_vapid_keys() -> tuple[str, str]:
    """Return (private_key, public_key_urlsafe_b64).

    Raises RuntimeError if VAPID keys are not configured. Keys must be set
    via VAPID_PRIVATE_KEY and VAPID_PUBLIC_KEY environment variables (D-12).
    Never writes keys to the filesystem to avoid plaintext secrets on disk.
    """
    global _vapid_cache
    if _vapid_cache:
        return _vapid_cache

    if settings.VAPID_PRIVATE_KEY and settings.VAPID_PUBLIC_KEY:
        _vapid_cache = (settings.VAPID_PRIVATE_KEY, settings.VAPID_PUBLIC_KEY)
        return _vapid_cache

    # Generate once, log the values, then raise so operator can persist them
    vapid = Vapid()
    vapid.generate_keys()
    private_raw = vapid.private_pem()
    public_raw = vapid.public_key_urlsafe_base64()
    logger.critical(
        "VAPID keys not configured. Set these env vars and restart:\n"
        "  VAPID_PRIVATE_KEY=%s\n"
        "  VAPID_PUBLIC_KEY=%s",
        private_raw,
        public_raw,
    )
    raise RuntimeError(
        "VAPID keys missing. See server logs for generated values to set in .env."
    )


async def ensure_vapid_keys_async() -> tuple[str, str]:
    """Async-safe wrapper around ensure_vapid_keys with double-checked locking.

    Protects against concurrent VAPID key generation races (HR-01).
    """
    global _vapid_cache
    if _vapid_cache:
        return _vapid_cache
    async with _vapid_lock:
        if _vapid_cache:
            return _vapid_cache
        # Delegate to sync version which populates _vapid_cache or raises
        return ensure_vapid_keys()


def get_vapid_public_key() -> str:
    """Return the VAPID public key in URL-safe base64 for frontend use."""
    _, public_key = ensure_vapid_keys()
    return public_key


async def send_push_to_user(
    user_id: str,
    event_type: str,
    payload: dict,
) -> None:
    """Send push notification to all of a user's subscriptions (D-13).

    Generates a short-lived JWT in the payload for service worker auth (Pitfall 2).
    Cleans up expired subscriptions on 410 (D-13).
    Respects per-type preferences (D-11).
    """
    pref_field = (
        "notify_permissions"
        if event_type == "permissionRequest"
        else "notify_completions"
    )

    with DBSession(engine) as db:
        subs = db.exec(
            select(PushSubscription)
            .where(PushSubscription.user_id == user_id)
            .where(getattr(PushSubscription, pref_field) == True)  # noqa: E712
        ).all()

    if not subs:
        return

    private_key, _ = await ensure_vapid_keys_async()
    contact = (
        settings.VAPID_CONTACT_EMAIL
        or settings.EMAILS_FROM_EMAIL
        or settings.FIRST_SUPERUSER
    )

    # Generate a 5-minute action token for service worker API calls
    action_token = create_access_token(
        subject=user_id,
        expires_delta=timedelta(minutes=5),
    )

    push_data = {
        "type": event_type,
        "token": action_token,
        **payload,
    }

    expired_ids: list = []

    for sub in subs:
        subscription_info = {
            "endpoint": sub.endpoint,
            "keys": {
                "p256dh": sub.p256dh,
                "auth": sub.auth,
            },
        }
        try:
            # Run blocking webpush in thread pool to avoid blocking event loop
            await asyncio.to_thread(
                webpush,
                subscription_info=subscription_info,
                data=json.dumps(push_data),
                vapid_private_key=private_key,
                vapid_claims={"sub": f"mailto:{contact}"},
            )
        except WebPushException as e:
            if (
                hasattr(e, "response")
                and e.response is not None
                and e.response.status_code == 410
            ):
                expired_ids.append(sub.id)
                logger.info(
                    "Push subscription %s expired (410), will remove", sub.id
                )
            else:
                logger.warning("Push to %s failed: %s", sub.endpoint[:60], e)
        except Exception:
            logger.exception(
                "Unexpected error sending push to %s", sub.endpoint[:60]
            )

    # Clean up expired subscriptions (D-13)
    if expired_ids:
        with DBSession(engine) as db:
            for sub_id in expired_ids:
                sub_row = db.get(PushSubscription, sub_id)
                if sub_row:
                    db.delete(sub_row)
            db.commit()
