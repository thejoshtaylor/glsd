"""GitHub App installation OAuth flow and CRUD endpoints."""

import uuid

import httpx
from fastapi import APIRouter, HTTPException
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.core.config import settings
from app.core.encryption import encrypt_token
from app.models import GitHubAppInstallation, GitHubInstallationPublic
from app.services.github_token import _make_app_jwt, get_installation_token

router = APIRouter(prefix="/github", tags=["github"])


@router.get("/install-url")
def get_install_url() -> dict:
    if not settings.GITHUB_APP_NAME:
        raise HTTPException(status_code=503, detail="GitHub App not configured")
    return {"url": f"https://github.com/apps/{settings.GITHUB_APP_NAME}/installations/new"}


@router.get("/callback")
async def github_callback(
    installation_id: int,
    setup_action: str,
    session: SessionDep,
    current_user: CurrentUser,
) -> dict:
    token, expires_at = await get_installation_token(installation_id)

    app_jwt = _make_app_jwt()
    headers = {
        "Authorization": f"Bearer {app_jwt}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://api.github.com/app/installations/{installation_id}",
            headers=headers,
        )
        resp.raise_for_status()
        install_data = resp.json()

    account_login = install_data["account"]["login"]
    account_type = install_data["account"]["type"]
    app_id = int(settings.GITHUB_APP_ID or "0")

    encrypted = encrypt_token(token, settings.GITHUB_TOKEN_ENCRYPTION_KEY or "")

    existing = session.exec(
        select(GitHubAppInstallation).where(
            GitHubAppInstallation.installation_id == installation_id
        )
    ).first()

    if existing:
        existing.user_id = current_user.id
        existing.encrypted_token = encrypted
        existing.token_expires_at = expires_at
        existing.account_login = account_login
        existing.account_type = account_type
        existing.app_id = app_id
        session.add(existing)
    else:
        installation = GitHubAppInstallation(
            installation_id=installation_id,
            account_login=account_login,
            account_type=account_type,
            app_id=app_id,
            encrypted_token=encrypted,
            token_expires_at=expires_at,
            user_id=current_user.id,
        )
        session.add(installation)

    session.commit()
    return {"status": "ok", "installation_id": installation_id}


@router.get("/installations", response_model=list[GitHubInstallationPublic])
def list_installations(session: SessionDep, current_user: CurrentUser):
    rows = session.exec(
        select(GitHubAppInstallation).where(
            GitHubAppInstallation.user_id == current_user.id
        )
    ).all()
    return rows


@router.delete("/installations/{installation_db_id}", status_code=204)
def delete_installation(
    installation_db_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> None:
    row = session.get(GitHubAppInstallation, installation_db_id)
    if not row:
        raise HTTPException(status_code=404, detail="Installation not found")
    if row.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    session.delete(row)
    session.commit()
