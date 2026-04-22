"""Admin settings routes — GET/PUT /api/v1/admin/settings/{key}."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.api.deps import CurrentUser, SessionDep, get_current_active_superuser
from app.models import AdminSetting, AdminSettingPublic, AdminSettingUpdate
from app.services import admin_settings as svc

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/settings", tags=["admin"])

SuperuserDep = Annotated[None, Depends(get_current_active_superuser)]


@router.get("/{key}", response_model=AdminSettingPublic)
def get_admin_setting(
    key: str,
    session: SessionDep,
    current_user: CurrentUser,
) -> AdminSettingPublic:
    """Return whether *key* is configured. Never returns plaintext."""
    row = session.get(AdminSetting, key)
    if row is None or row.encrypted_value is None:
        return AdminSettingPublic(key=key, is_set=False, last_four=None)
    # Retrieve last 4 chars of plaintext for UI confirmation display
    plaintext = svc.get_setting(session, key)
    last_four = plaintext[-4:] if plaintext and len(plaintext) >= 4 else None
    return AdminSettingPublic(
        key=key,
        is_set=True,
        last_four=last_four,
        updated_at=row.updated_at,
    )


@router.put("/{key}", response_model=AdminSettingPublic)
def put_admin_setting(
    key: str,
    body: AdminSettingUpdate,
    session: SessionDep,
    _superuser: SuperuserDep,
) -> AdminSettingPublic:
    """Store Fernet-encrypted *value* for *key*. Superuser-only."""
    row = svc.set_setting(session, key, body.value)
    last_four = body.value[-4:] if len(body.value) >= 4 else None
    logger.info("admin_settings.put key=%s", key)
    return AdminSettingPublic(
        key=key,
        is_set=True,
        last_four=last_four,
        updated_at=row.updated_at,
    )
