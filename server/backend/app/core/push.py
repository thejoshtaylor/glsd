"""Web Push notification service.

VAPID key auto-generation (D-12) and push dispatch (NOTF-01, NOTF-02).
"""

import asyncio
import json
import logging
from datetime import timedelta
from pathlib import Path

from pywebpush import webpush, WebPushException
from py_vapid import Vapid
from sqlmodel import Session as DBSession, select

from app.core.config import settings
from app.core.db import engine
from app.core.security import create_access_token
from app.models import PushSubscription

logger = logging.getLogger(__name__)


def ensure_vapid_keys() -> tuple[str, str]:
    """Return (private_key, public_key_urlsafe_b64). Generate if missing (D-12)."""
    if settings.VAPID_PRIVATE_KEY and settings.VAPID_PUBLIC_KEY:
        return settings.VAPID_PRIVATE_KEY, settings.VAPID_PUBLIC_KEY

    logger.warning("VAPID keys not found in env. Generating new key pair...")
    vapid = Vapid()
    vapid.generate_keys()
    private_raw = vapid.private_pem()
    public_raw = vapid.public_key_urlsafe_base64()

    # Write to .env so subsequent boots reuse keys (D-12)
    env_file = settings.model_config.get("env_file", "../.env")
    env_path = Path(env_file) if isinstance(env_file, str) else Path("../.env")
    try:
        with open(env_path, "a") as f:
            f.write(f"\nVAPID_PRIVATE_KEY={private_raw}\n")
            f.write(f"VAPID_PUBLIC_KEY={public_raw}\n")
        logger.info("VAPID keys written to %s", env_path)
    except OSError:
        logger.error(
            "Could not write VAPID keys to %s -- set env vars manually", env_path
        )

    return private_raw, public_raw


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

    private_key, _ = ensure_vapid_keys()
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
