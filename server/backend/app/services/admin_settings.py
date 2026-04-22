"""AdminSetting service — Fernet-encrypted key-value store for admin config."""

import base64
import hashlib
import logging

from cryptography.fernet import Fernet, InvalidToken
from sqlmodel import Session

from app.core.config import settings
from app.models import AdminSetting

logger = logging.getLogger(__name__)


def _fernet() -> Fernet:
    """Derive a Fernet key from SECRET_KEY via SHA-256 + URL-safe base64."""
    raw = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    key = base64.urlsafe_b64encode(raw)
    return Fernet(key)


def get_setting(session: Session, key: str) -> str | None:
    """Return decrypted plaintext for *key*, or None if unset / decrypt fails."""
    row = session.get(AdminSetting, key)
    if row is None or row.encrypted_value is None:
        return None
    try:
        return _fernet().decrypt(row.encrypted_value.encode()).decode()
    except (InvalidToken, Exception) as exc:
        logger.error(
            "admin_settings.decrypt_failed key=%s error=%s",
            key,
            type(exc).__name__,
        )
        return None


def set_setting(session: Session, key: str, value: str) -> AdminSetting:
    """Encrypt *value* and upsert the AdminSetting row for *key*."""
    from datetime import datetime, timezone
    encrypted = _fernet().encrypt(value.encode()).decode()
    row = session.get(AdminSetting, key)
    if row is None:
        row = AdminSetting(key=key, encrypted_value=encrypted)
        session.add(row)
    else:
        row.encrypted_value = encrypted
        row.updated_at = datetime.now(timezone.utc)
        session.add(row)
    session.commit()
    session.refresh(row)
    logger.info("admin_settings.set key=%s", key)
    return row
