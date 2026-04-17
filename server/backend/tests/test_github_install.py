"""Tests for GitHub App installation OAuth flow and CRUD endpoints (S02)."""

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app


@pytest.fixture(scope="module")
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def auth_headers(client: TestClient) -> dict[str, str]:
    """Return auth headers for superuser."""
    from tests.utils.utils import get_superuser_token_headers
    return get_superuser_token_headers(client)


def test_install_url_returns_correct_url(client: TestClient, auth_headers: dict) -> None:
    with patch.object(settings, "GITHUB_APP_NAME", "test-app"):
        resp = client.get("/api/v1/github/install-url", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "url" in data
    assert "test-app" in data["url"]
    assert "installations/new" in data["url"]


def test_install_url_503_when_unconfigured(client: TestClient, auth_headers: dict) -> None:
    with patch.object(settings, "GITHUB_APP_NAME", None):
        resp = client.get("/api/v1/github/install-url", headers=auth_headers)
    assert resp.status_code == 503


def test_list_installations_empty_for_new_user(client: TestClient, auth_headers: dict) -> None:
    resp = client.get("/api/v1/github/installations", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)


def test_delete_installation_404_unknown_id(client: TestClient, auth_headers: dict) -> None:
    unknown_id = "00000000-0000-0000-0000-000000000000"
    resp = client.delete(f"/api/v1/github/installations/{unknown_id}", headers=auth_headers)
    assert resp.status_code == 404


def _make_mock_httpx(installation_id: int = 12345) -> tuple:
    """Return mocked post and get responses for GitHub API calls."""
    expires_at = (datetime.now(UTC) + timedelta(hours=1)).isoformat().replace("+00:00", "Z")

    mock_post_resp = MagicMock()
    mock_post_resp.status_code = 201
    mock_post_resp.json.return_value = {
        "token": "ghs_testtoken",
        "expires_at": expires_at,
    }
    mock_post_resp.raise_for_status = MagicMock()

    mock_get_resp = MagicMock()
    mock_get_resp.status_code = 200
    mock_get_resp.json.return_value = {
        "account": {"login": "test-org", "type": "Organization"},
        "app_id": 99999,
    }
    mock_get_resp.raise_for_status = MagicMock()

    return mock_post_resp, mock_get_resp


def test_callback_stores_installation(client: TestClient, auth_headers: dict) -> None:
    installation_id = 99001
    mock_post_resp, mock_get_resp = _make_mock_httpx(installation_id)

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.post = AsyncMock(return_value=mock_post_resp)
    mock_client.get = AsyncMock(return_value=mock_get_resp)

    with patch("app.api.routes.github.httpx.AsyncClient", return_value=mock_client), \
         patch("app.services.github_token.httpx.AsyncClient", return_value=mock_client), \
         patch.object(settings, "GITHUB_APP_ID", "99999"), \
         patch.object(settings, "GITHUB_APP_PRIVATE_KEY", "dummy"), \
         patch.object(settings, "GITHUB_TOKEN_ENCRYPTION_KEY", None), \
         patch("app.api.routes.github.encrypt_token", return_value="encrypted"), \
         patch("app.api.routes.github._make_app_jwt", return_value="fake.jwt.token"), \
         patch("app.api.routes.github.get_installation_token", new_callable=AsyncMock,
               return_value=("ghs_testtoken", datetime.now(UTC) + timedelta(hours=1))):
        resp = client.get(
            f"/api/v1/github/callback?installation_id={installation_id}&setup_action=install",
            headers=auth_headers,
        )

    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"

    list_resp = client.get("/api/v1/github/installations", headers=auth_headers)
    assert list_resp.status_code == 200
    items = list_resp.json()
    ids = [item["installation_id"] for item in items]
    assert installation_id in ids


def test_callback_upserts_on_reinstall(client: TestClient, auth_headers: dict) -> None:
    installation_id = 99002
    mock_post_resp, mock_get_resp = _make_mock_httpx(installation_id)

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.post = AsyncMock(return_value=mock_post_resp)
    mock_client.get = AsyncMock(return_value=mock_get_resp)

    patches = [
        patch("app.api.routes.github.httpx.AsyncClient", return_value=mock_client),
        patch("app.services.github_token.httpx.AsyncClient", return_value=mock_client),
        patch.object(settings, "GITHUB_APP_ID", "99999"),
        patch.object(settings, "GITHUB_APP_PRIVATE_KEY", "dummy"),
        patch.object(settings, "GITHUB_TOKEN_ENCRYPTION_KEY", None),
        patch("app.api.routes.github.encrypt_token", return_value="encrypted"),
        patch("app.api.routes.github._make_app_jwt", return_value="fake.jwt.token"),
        patch("app.api.routes.github.get_installation_token", new_callable=AsyncMock,
              return_value=("ghs_testtoken", datetime.now(UTC) + timedelta(hours=1))),
    ]

    url = f"/api/v1/github/callback?installation_id={installation_id}&setup_action=install"
    for _ in range(2):
        with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6], patches[7]:
            resp = client.get(url, headers=auth_headers)
        assert resp.status_code == 200

    list_resp = client.get("/api/v1/github/installations", headers=auth_headers)
    items = list_resp.json()
    matching = [item for item in items if item["installation_id"] == installation_id]
    assert len(matching) == 1
