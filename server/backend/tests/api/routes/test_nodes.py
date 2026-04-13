"""Node pairing REST endpoint tests for AUTH-04, RELY-01, D-03."""
import uuid
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from tests.utils.user import authentication_token_from_email, create_random_user
from tests.utils.utils import random_email, random_lower_string


def test_create_node_token(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """AUTH-04 / RELY-01: POST /api/v1/nodes/ returns node_id, token, relay_url."""
    response = client.post(
        f"{settings.API_V1_STR}/nodes/",
        headers=superuser_token_headers,
        json={"name": "test-node"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "node_id" in data
    assert "token" in data
    assert len(data["token"]) >= 20  # token_urlsafe(32) produces 43 chars
    assert "relay_url" in data
    assert len(data["relay_url"]) > 0


def test_create_node_token_no_auth(client: TestClient) -> None:
    """AUTH-04: POST /api/v1/nodes/ without auth returns 401."""
    response = client.post(
        f"{settings.API_V1_STR}/nodes/", json={"name": "test-node"}
    )
    assert response.status_code in (401, 403)


def test_list_nodes(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """AUTH-04: GET /api/v1/nodes/ returns list without token_hash."""
    # Create a node first
    client.post(
        f"{settings.API_V1_STR}/nodes/",
        headers=superuser_token_headers,
        json={"name": "list-test-node"},
    )
    response = client.get(
        f"{settings.API_V1_STR}/nodes/", headers=superuser_token_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert "count" in data
    assert data["count"] >= 1
    for node in data["data"]:
        assert "token_hash" not in node
        assert "id" in node
        assert "name" in node
        assert "is_revoked" in node


def test_revoke_node(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """D-03: POST /api/v1/nodes/{id}/revoke marks node revoked."""
    create_resp = client.post(
        f"{settings.API_V1_STR}/nodes/",
        headers=superuser_token_headers,
        json={"name": "revoke-test-node"},
    )
    assert create_resp.status_code == 200
    node_id = create_resp.json()["node_id"]
    revoke_resp = client.post(
        f"{settings.API_V1_STR}/nodes/{node_id}/revoke",
        headers=superuser_token_headers,
    )
    assert revoke_resp.status_code == 200
    assert revoke_resp.json()["is_revoked"] is True

    # Confirm via list
    list_resp = client.get(
        f"{settings.API_V1_STR}/nodes/", headers=superuser_token_headers
    )
    revoked_nodes = [
        n for n in list_resp.json()["data"] if n["id"] == str(node_id)
    ]
    assert len(revoked_nodes) == 1
    assert revoked_nodes[0]["is_revoked"] is True


def test_revoke_other_users_node(
    client: TestClient, db: Session
) -> None:
    """D-04: Revoking another user's node returns 404."""
    # Create user A and get their auth headers
    user_a_email = random_email()
    user_a_headers = authentication_token_from_email(
        client=client, email=user_a_email, db=db
    )

    # Create a node as user A
    create_resp = client.post(
        f"{settings.API_V1_STR}/nodes/",
        headers=user_a_headers,
        json={"name": "user-a-node"},
    )
    assert create_resp.status_code == 200
    node_id = create_resp.json()["node_id"]

    # Create user B and get their auth headers
    user_b_email = random_email()
    user_b_headers = authentication_token_from_email(
        client=client, email=user_b_email, db=db
    )

    # User B tries to revoke user A's node -- should get 404
    revoke_resp = client.post(
        f"{settings.API_V1_STR}/nodes/{node_id}/revoke",
        headers=user_b_headers,
    )
    assert revoke_resp.status_code == 404


def test_get_node(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """AUTH-05: GET /api/v1/nodes/{node_id} returns 200 with matching node data."""
    create_resp = client.post(
        f"{settings.API_V1_STR}/nodes/",
        headers=superuser_token_headers,
        json={"name": "get-node-test"},
    )
    assert create_resp.status_code == 200
    node_id = create_resp.json()["node_id"]

    response = client.get(
        f"{settings.API_V1_STR}/nodes/{node_id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == node_id
    assert data["name"] == "get-node-test"
    assert data["is_revoked"] is False
    assert "token_hash" not in data


def test_get_node_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """AUTH-06: GET /api/v1/nodes/{random_uuid} returns 404."""
    fake_id = str(uuid.uuid4())
    response = client.get(
        f"{settings.API_V1_STR}/nodes/{fake_id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 404


def test_get_other_users_node(
    client: TestClient, db: Session
) -> None:
    """T-07-01: GET /api/v1/nodes/{id} for another user's node returns 404 (no info leak)."""
    # Create user A and a node belonging to user A
    user_a_email = random_email()
    user_a_headers = authentication_token_from_email(
        client=client, email=user_a_email, db=db
    )
    create_resp = client.post(
        f"{settings.API_V1_STR}/nodes/",
        headers=user_a_headers,
        json={"name": "user-a-get-node"},
    )
    assert create_resp.status_code == 200
    node_id = create_resp.json()["node_id"]

    # Create user B and try to GET user A's node
    user_b_email = random_email()
    user_b_headers = authentication_token_from_email(
        client=client, email=user_b_email, db=db
    )
    response = client.get(
        f"{settings.API_V1_STR}/nodes/{node_id}",
        headers=user_b_headers,
    )
    assert response.status_code == 404


def test_generate_pairing_code_returns_6_char(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """POST /api/v1/nodes/code returns 6-char uppercase alphanumeric code."""
    mock_redis = AsyncMock()
    mock_redis.set = AsyncMock(return_value=True)

    with patch("app.core.pairing.get_redis", new=AsyncMock(return_value=mock_redis)):
        response = client.post(
            f"{settings.API_V1_STR}/nodes/code",
            headers=superuser_token_headers,
            json={"name": "code-test-node"},
        )

    assert response.status_code == 200
    data = response.json()
    assert "code" in data
    code = data["code"]
    assert len(code) == 6
    # Verify only allowed characters (no 0, O, I, 1, L)
    allowed = set("ABCDEFGHJKMNPQRSTUVWXYZ23456789")
    assert all(c in allowed for c in code)


def test_generate_pairing_code_no_auth(client: TestClient) -> None:
    """POST /api/v1/nodes/code without auth returns 401."""
    response = client.post(
        f"{settings.API_V1_STR}/nodes/code",
        json={"name": "no-auth-node"},
    )
    assert response.status_code in (401, 403)


def test_generate_pairing_code_requires_name(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """POST /api/v1/nodes/code requires name field in body."""
    mock_redis = AsyncMock()
    mock_redis.set = AsyncMock(return_value=True)

    with patch("app.core.pairing.get_redis", new=AsyncMock(return_value=mock_redis)):
        response = client.post(
            f"{settings.API_V1_STR}/nodes/code",
            headers=superuser_token_headers,
            json={},
        )

    assert response.status_code == 422  # Validation error


def test_verify_node_token_crud(db: Session) -> None:
    """RELY-01: verify_node_token returns Node when raw token matches hash."""
    from app import crud

    # Create a node via the CRUD helper
    user = create_random_user(db)
    node, raw_token = crud.create_node_token(
        session=db, user_id=user.id, name="verify-test"
    )

    # Verify with correct token
    found = crud.verify_node_token(session=db, token=raw_token)
    assert found is not None
    assert found.id == node.id

    # Verify with wrong token
    not_found = crud.verify_node_token(session=db, token="wrong-token-value")
    assert not_found is None
