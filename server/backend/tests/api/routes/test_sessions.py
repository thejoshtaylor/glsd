"""Session lifecycle REST endpoint tests for SESS-01, SESS-02."""
import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app import crud
from app.core.config import settings
from tests.utils.user import authentication_token_from_email, create_random_user
from tests.utils.utils import random_email


def _create_node_for_user(
    client: TestClient, headers: dict[str, str]
) -> tuple[str, str]:
    """Helper: create a node and return (node_id, raw_token)."""
    resp = client.post(
        f"{settings.API_V1_STR}/nodes/",
        headers=headers,
        json={"name": "session-test-node"},
    )
    assert resp.status_code == 200
    data = resp.json()
    return data["node_id"], data["token"]


def test_create_session(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """SESS-01: POST /api/v1/sessions/ with valid node_id returns session."""
    node_id, _ = _create_node_for_user(client, superuser_token_headers)
    response = client.post(
        f"{settings.API_V1_STR}/sessions/",
        headers=superuser_token_headers,
        json={"node_id": node_id, "cwd": "/tmp"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["node_id"] == node_id
    assert data["status"] == "created"
    assert data["cwd"] == "/tmp"
    assert "id" in data


def test_create_session_nonexistent_node(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """SESS-01: POST /api/v1/sessions/ with non-existent node_id returns 404."""
    fake_node_id = str(uuid.uuid4())
    response = client.post(
        f"{settings.API_V1_STR}/sessions/",
        headers=superuser_token_headers,
        json={"node_id": fake_node_id, "cwd": "/tmp"},
    )
    assert response.status_code == 404


def test_create_session_no_auth(client: TestClient) -> None:
    """SESS-01: POST /api/v1/sessions/ without auth returns 401."""
    response = client.post(
        f"{settings.API_V1_STR}/sessions/",
        json={"node_id": "00000000-0000-0000-0000-000000000000", "cwd": "/tmp"},
    )
    assert response.status_code in (401, 403)


def test_list_sessions(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """SESS-01: GET /api/v1/sessions/ returns user's sessions."""
    # Create a node and session first
    node_id, _ = _create_node_for_user(client, superuser_token_headers)
    client.post(
        f"{settings.API_V1_STR}/sessions/",
        headers=superuser_token_headers,
        json={"node_id": node_id, "cwd": "/home"},
    )
    response = client.get(
        f"{settings.API_V1_STR}/sessions/", headers=superuser_token_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert "count" in data
    assert data["count"] >= 1


def test_get_session(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """SESS-01: GET /api/v1/sessions/{id} returns the session."""
    node_id, _ = _create_node_for_user(client, superuser_token_headers)
    create_resp = client.post(
        f"{settings.API_V1_STR}/sessions/",
        headers=superuser_token_headers,
        json={"node_id": node_id, "cwd": "/opt"},
    )
    session_id = create_resp.json()["id"]
    response = client.get(
        f"{settings.API_V1_STR}/sessions/{session_id}",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    assert response.json()["id"] == session_id


def test_stop_session(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """SESS-02: POST /api/v1/sessions/{id}/stop on a session returns 200."""
    node_id, _ = _create_node_for_user(client, superuser_token_headers)
    create_resp = client.post(
        f"{settings.API_V1_STR}/sessions/",
        headers=superuser_token_headers,
        json={"node_id": node_id, "cwd": "/tmp"},
    )
    session_id = create_resp.json()["id"]
    response = client.post(
        f"{settings.API_V1_STR}/sessions/{session_id}/stop",
        headers=superuser_token_headers,
    )
    assert response.status_code == 200
    assert response.json()["id"] == session_id


def test_stop_other_users_session(
    client: TestClient, db: Session
) -> None:
    """SESS-02: Stopping another user's session returns 404."""
    # Create user A with a node and session
    user_a_email = random_email()
    user_a_headers = authentication_token_from_email(
        client=client, email=user_a_email, db=db
    )
    node_id, _ = _create_node_for_user(client, user_a_headers)
    create_resp = client.post(
        f"{settings.API_V1_STR}/sessions/",
        headers=user_a_headers,
        json={"node_id": node_id, "cwd": "/tmp"},
    )
    session_id = create_resp.json()["id"]

    # Create user B
    user_b_email = random_email()
    user_b_headers = authentication_token_from_email(
        client=client, email=user_b_email, db=db
    )

    # User B tries to stop user A's session
    response = client.post(
        f"{settings.API_V1_STR}/sessions/{session_id}/stop",
        headers=user_b_headers,
    )
    assert response.status_code == 404


def test_create_session_on_other_users_node(
    client: TestClient, db: Session
) -> None:
    """T-03-12: Cannot create session on another user's node."""
    # Create user A with a node
    user_a_email = random_email()
    user_a_headers = authentication_token_from_email(
        client=client, email=user_a_email, db=db
    )
    node_id, _ = _create_node_for_user(client, user_a_headers)

    # Create user B
    user_b_email = random_email()
    user_b_headers = authentication_token_from_email(
        client=client, email=user_b_email, db=db
    )

    # User B tries to create session on user A's node
    response = client.post(
        f"{settings.API_V1_STR}/sessions/",
        headers=user_b_headers,
        json={"node_id": node_id, "cwd": "/tmp"},
    )
    assert response.status_code == 404
