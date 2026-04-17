"""GitHub App token service — JWT generation and installation token exchange."""

import time
from datetime import UTC, datetime, timedelta

import httpx
import jwt

from app.core.config import settings
from app.core.encryption import decrypt_token, encrypt_token


def _make_app_jwt() -> str:
    now = int(time.time())
    payload = {
        "iat": now - 60,
        "exp": now + 600,
        "iss": settings.GITHUB_APP_ID,
    }
    private_key = (settings.GITHUB_APP_PRIVATE_KEY or "").replace("\\n", "\n")
    return jwt.encode(payload, private_key, algorithm="RS256")


async def get_installation_token(installation_id: int) -> tuple[str, datetime]:
    app_jwt = _make_app_jwt()
    headers = {
        "Authorization": f"Bearer {app_jwt}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"https://api.github.com/app/installations/{installation_id}/access_tokens",
            headers=headers,
        )
        resp.raise_for_status()
        data = resp.json()
    token = data["token"]
    expires_at = datetime.fromisoformat(data["expires_at"].replace("Z", "+00:00"))
    return token, expires_at


async def get_fresh_installation_token(installation, session) -> str:
    from app.models import GitHubAppInstallation

    now = datetime.now(UTC)
    expires_at = installation.token_expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)

    if expires_at > now + timedelta(minutes=5):
        return decrypt_token(installation.encrypted_token, settings.GITHUB_TOKEN_ENCRYPTION_KEY or "")

    token, new_expires_at = await get_installation_token(installation.installation_id)
    installation.encrypted_token = encrypt_token(token, settings.GITHUB_TOKEN_ENCRYPTION_KEY or "")
    installation.token_expires_at = new_expires_at
    session.add(installation)
    session.commit()
    return token
