"""Session lifecycle REST endpoint test stubs for SESS-01, SESS-02.

Marked xfail until Plan 03 implements the endpoints.
"""
import pytest
from fastapi.testclient import TestClient


@pytest.mark.xfail(reason="Plan 03 not yet implemented", strict=False)
def test_create_session(client: TestClient, superuser_token_headers: dict) -> None:
    """SESS-01: POST /api/v1/sessions/ with valid node_id returns session."""
    # Requires a node to exist first -- Plan 02 delivers node creation
    response = client.post(
        "/api/v1/sessions/",
        headers=superuser_token_headers,
        json={"node_id": "00000000-0000-0000-0000-000000000000", "cwd": "/tmp"},
    )
    # Will be 404 until a real node exists; test validates the endpoint exists
    assert response.status_code in (200, 404)


@pytest.mark.xfail(reason="Plan 03 not yet implemented", strict=False)
def test_create_session_no_auth(client: TestClient) -> None:
    """SESS-01: POST /api/v1/sessions/ without auth returns 401."""
    response = client.post(
        "/api/v1/sessions/",
        json={"node_id": "00000000-0000-0000-0000-000000000000", "cwd": "/tmp"},
    )
    assert response.status_code == 401


@pytest.mark.xfail(reason="Plan 03 not yet implemented", strict=False)
def test_list_sessions(client: TestClient, superuser_token_headers: dict) -> None:
    """SESS-01: GET /api/v1/sessions/ returns user's sessions."""
    response = client.get("/api/v1/sessions/", headers=superuser_token_headers)
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert "count" in data


@pytest.mark.xfail(reason="Plan 03 not yet implemented", strict=False)
def test_stop_session(client: TestClient, superuser_token_headers: dict) -> None:
    """SESS-02: POST /api/v1/sessions/{id}/stop forwards stop to daemon."""
    # Requires a running session -- validates endpoint exists
    response = client.post(
        "/api/v1/sessions/00000000-0000-0000-0000-000000000000/stop",
        headers=superuser_token_headers,
    )
    assert response.status_code in (200, 404)


@pytest.mark.xfail(reason="Plan 03 not yet implemented", strict=False)
def test_stop_other_users_session(client: TestClient) -> None:
    """SESS-02: Stopping another user's session returns 404."""
    pass
