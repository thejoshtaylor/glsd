"""Tests for GET/PUT /users/me/settings (D-03, D-05)."""
from fastapi.testclient import TestClient

from app.core.config import settings


def test_get_settings_creates_defaults(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """First GET creates a default settings row and returns it."""
    r = client.get(
        f"{settings.API_V1_STR}/users/me/settings",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["theme"] == "system"
    assert data["user_mode"] == "expert"
    assert data["notifications_enabled"] is True
    assert data["debug_logging"] is False
    # Should not expose internal fields
    assert "id" not in data
    assert "user_id" not in data


def test_get_settings_idempotent(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """Repeated GET returns same data, does not create duplicate rows."""
    r1 = client.get(
        f"{settings.API_V1_STR}/users/me/settings",
        headers=superuser_token_headers,
    )
    r2 = client.get(
        f"{settings.API_V1_STR}/users/me/settings",
        headers=superuser_token_headers,
    )
    assert r1.json() == r2.json()


def test_put_settings_updates(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """PUT updates specific fields, leaves others at defaults."""
    # Ensure row exists
    client.get(
        f"{settings.API_V1_STR}/users/me/settings",
        headers=superuser_token_headers,
    )
    r = client.put(
        f"{settings.API_V1_STR}/users/me/settings",
        headers=superuser_token_headers,
        json={"theme": "dark", "user_mode": "guided"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["theme"] == "dark"
    assert data["user_mode"] == "guided"
    # Other fields remain default
    assert data["accent_color"] == "default"


def test_put_settings_unauthenticated(client: TestClient) -> None:
    """PUT without auth returns 401."""
    r = client.put(
        f"{settings.API_V1_STR}/users/me/settings",
        json={"theme": "dark"},
    )
    assert r.status_code == 401
