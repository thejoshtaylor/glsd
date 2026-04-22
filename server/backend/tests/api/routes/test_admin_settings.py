"""Integration tests for GET/PUT /api/v1/admin/settings/{key}."""

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from app.models import AdminSetting
from app.services import admin_settings as svc


TEST_KEY = "openai_api_key"
TEST_VALUE = "sk-test-1234567890abcdef"


def _cleanup(db: Session, key: str) -> None:
    row = db.get(AdminSetting, key)
    if row:
        db.delete(row)
        db.commit()


def test_get_before_put_returns_not_set(
    client: TestClient,
    db: Session,
    normal_user_token_headers: dict[str, str],
) -> None:
    _cleanup(db, TEST_KEY)
    resp = client.get(
        f"{settings.API_V1_STR}/admin/settings/{TEST_KEY}",
        headers=normal_user_token_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_set"] is False
    assert data["last_four"] is None


def test_put_as_non_superuser_returns_403(
    client: TestClient,
    db: Session,
    normal_user_token_headers: dict[str, str],
) -> None:
    _cleanup(db, TEST_KEY)
    resp = client.put(
        f"{settings.API_V1_STR}/admin/settings/{TEST_KEY}",
        json={"value": TEST_VALUE},
        headers=normal_user_token_headers,
    )
    assert resp.status_code == 403


def test_put_as_superuser_stores_encrypted(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
    _cleanup(db, TEST_KEY)
    resp = client.put(
        f"{settings.API_V1_STR}/admin/settings/{TEST_KEY}",
        json={"value": TEST_VALUE},
        headers=superuser_token_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_set"] is True
    assert data["last_four"] == TEST_VALUE[-4:]

    # Assert DB stores ciphertext not plaintext
    row = db.get(AdminSetting, TEST_KEY)
    db.refresh(row)  # type: ignore[arg-type]
    assert row is not None
    assert row.encrypted_value != TEST_VALUE

    _cleanup(db, TEST_KEY)


def test_get_after_put_returns_is_set_and_last_four(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
    normal_user_token_headers: dict[str, str],
) -> None:
    _cleanup(db, TEST_KEY)
    # PUT as superuser
    client.put(
        f"{settings.API_V1_STR}/admin/settings/{TEST_KEY}",
        json={"value": TEST_VALUE},
        headers=superuser_token_headers,
    )
    # GET as normal user
    resp = client.get(
        f"{settings.API_V1_STR}/admin/settings/{TEST_KEY}",
        headers=normal_user_token_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_set"] is True
    assert data["last_four"] == TEST_VALUE[-4:]

    _cleanup(db, TEST_KEY)


def test_put_empty_value_returns_422(
    client: TestClient,
    superuser_token_headers: dict[str, str],
) -> None:
    resp = client.put(
        f"{settings.API_V1_STR}/admin/settings/{TEST_KEY}",
        json={"value": ""},
        headers=superuser_token_headers,
    )
    assert resp.status_code == 422


def test_get_for_never_set_key_returns_200_not_404(
    client: TestClient,
    db: Session,
    normal_user_token_headers: dict[str, str],
) -> None:
    _cleanup(db, "key_that_never_existed_xyz")
    resp = client.get(
        f"{settings.API_V1_STR}/admin/settings/key_that_never_existed_xyz",
        headers=normal_user_token_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["is_set"] is False


def test_unauthenticated_get_returns_401(client: TestClient, db: Session) -> None:
    _cleanup(db, TEST_KEY)
    resp = client.get(f"{settings.API_V1_STR}/admin/settings/{TEST_KEY}")
    assert resp.status_code == 401
