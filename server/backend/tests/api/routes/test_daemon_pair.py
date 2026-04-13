"""Tests for POST /api/daemon/pair endpoint.

Verifies pairing code exchange, single-use enforcement, and error handling.
The daemon endpoint is unauthenticated (no JWT needed).
"""
import json
import uuid
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from tests.utils.user import authentication_token_from_email
from tests.utils.utils import random_email


def _mock_redis_with_code(code: str, user_id: str, node_name: str) -> AsyncMock:
    """Create a mock Redis that has a pairing code stored."""
    store: dict[str, str] = {
        f"pair:{code}": json.dumps(
            {"user_id": user_id, "node_name": node_name}
        )
    }

    mock_redis = AsyncMock()

    async def mock_getdel(key: str):
        return store.pop(key, None)

    mock_redis.getdel = mock_getdel
    return mock_redis


def test_daemon_pair_valid_code(
    client: TestClient, db: Session
) -> None:
    """POST /api/daemon/pair with valid code returns machineId, authToken, relayUrl."""
    # Create a real user to own the node
    user_email = random_email()
    authentication_token_from_email(client=client, email=user_email, db=db)

    from app.models import User
    from sqlmodel import select

    user = db.exec(select(User).where(User.email == user_email)).first()
    assert user is not None

    code = "ABC123"
    mock_redis = _mock_redis_with_code(code, str(user.id), "test-daemon-node")

    with patch("app.core.pairing.get_redis", return_value=mock_redis):
        with patch("app.api.routes.daemon.get_redis", return_value=mock_redis):
            response = client.post(
                "/api/daemon/pair",
                json={
                    "code": "ABC123",
                    "hostname": "my-machine",
                    "os": "linux",
                    "arch": "amd64",
                    "daemonVersion": "0.1.0",
                },
            )

    assert response.status_code == 200
    data = response.json()
    assert "machineId" in data
    assert "authToken" in data
    assert "relayUrl" in data
    assert len(data["authToken"]) >= 20


def test_daemon_pair_invalid_code(client: TestClient) -> None:
    """POST /api/daemon/pair with invalid code returns 404."""
    mock_redis = AsyncMock()
    mock_redis.getdel = AsyncMock(return_value=None)

    with patch("app.api.routes.daemon.get_redis", return_value=mock_redis):
        response = client.post(
            "/api/daemon/pair",
            json={
                "code": "XXXXXX",
                "hostname": "my-machine",
                "os": "linux",
                "arch": "amd64",
                "daemonVersion": "0.1.0",
            },
        )

    assert response.status_code == 404
    assert response.json()["detail"] == "Invalid or expired code"


def test_daemon_pair_single_use(
    client: TestClient, db: Session
) -> None:
    """POST /api/daemon/pair code is single-use (second call returns 404)."""
    user_email = random_email()
    authentication_token_from_email(client=client, email=user_email, db=db)

    from app.models import User
    from sqlmodel import select

    user = db.exec(select(User).where(User.email == user_email)).first()
    assert user is not None

    code = "SINGLE"
    mock_redis = _mock_redis_with_code(code, str(user.id), "single-use-node")

    pair_body = {
        "code": code,
        "hostname": "host1",
        "os": "linux",
        "arch": "amd64",
        "daemonVersion": "0.1.0",
    }

    with patch("app.api.routes.daemon.get_redis", return_value=mock_redis):
        # First call succeeds
        resp1 = client.post("/api/daemon/pair", json=pair_body)
        assert resp1.status_code == 200

        # Second call with same code returns 404 (code consumed by GETDEL)
        resp2 = client.post("/api/daemon/pair", json=pair_body)
        assert resp2.status_code == 404


def test_daemon_pair_is_unauthenticated(client: TestClient) -> None:
    """POST /api/daemon/pair does not require JWT authentication."""
    mock_redis = AsyncMock()
    mock_redis.getdel = AsyncMock(return_value=None)

    with patch("app.api.routes.daemon.get_redis", return_value=mock_redis):
        # No auth headers -- should get 404 (invalid code), not 401
        response = client.post(
            "/api/daemon/pair",
            json={
                "code": "NOAUTH",
                "hostname": "h",
                "os": "linux",
                "arch": "amd64",
                "daemonVersion": "0.1.0",
            },
        )

    assert response.status_code == 404  # Not 401
