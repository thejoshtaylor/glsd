"""Node pairing REST endpoint test stubs for AUTH-04, RELY-01.

Marked xfail until Plan 02 implements the endpoints.
"""
import pytest
from fastapi.testclient import TestClient


@pytest.mark.xfail(reason="Plan 02 not yet implemented", strict=False)
def test_create_node_token(client: TestClient, superuser_token_headers: dict) -> None:
    """AUTH-04 / RELY-01: POST /api/v1/nodes/ returns node_id, token, relay_url."""
    response = client.post(
        "/api/v1/nodes/",
        headers=superuser_token_headers,
        json={"name": "test-node"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "node_id" in data
    assert "token" in data
    assert len(data["token"]) > 20  # token_urlsafe(32) produces 43 chars
    assert "relay_url" in data


@pytest.mark.xfail(reason="Plan 02 not yet implemented", strict=False)
def test_create_node_token_no_auth(client: TestClient) -> None:
    """AUTH-04: POST /api/v1/nodes/ without auth returns 401."""
    response = client.post("/api/v1/nodes/", json={"name": "test-node"})
    assert response.status_code == 401


@pytest.mark.xfail(reason="Plan 02 not yet implemented", strict=False)
def test_list_nodes(client: TestClient, superuser_token_headers: dict) -> None:
    """AUTH-04: GET /api/v1/nodes/ returns list without token_hash."""
    # Create a node first
    client.post(
        "/api/v1/nodes/",
        headers=superuser_token_headers,
        json={"name": "list-test-node"},
    )
    response = client.get("/api/v1/nodes/", headers=superuser_token_headers)
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert "count" in data
    for node in data["data"]:
        assert "token_hash" not in node


@pytest.mark.xfail(reason="Plan 02 not yet implemented", strict=False)
def test_revoke_node(client: TestClient, superuser_token_headers: dict) -> None:
    """D-03: POST /api/v1/nodes/{id}/revoke marks node revoked."""
    create_resp = client.post(
        "/api/v1/nodes/",
        headers=superuser_token_headers,
        json={"name": "revoke-test-node"},
    )
    node_id = create_resp.json()["node_id"]
    revoke_resp = client.post(
        f"/api/v1/nodes/{node_id}/revoke",
        headers=superuser_token_headers,
    )
    assert revoke_resp.status_code == 200
    assert revoke_resp.json()["is_revoked"] is True


@pytest.mark.xfail(reason="Plan 02 not yet implemented", strict=False)
def test_revoke_other_users_node(client: TestClient) -> None:
    """D-04: Revoking another user's node returns 404."""
    # Needs two users -- implementation will create them
    pass


@pytest.mark.xfail(reason="Plan 02 not yet implemented", strict=False)
def test_verify_node_token_crud(db_session) -> None:
    """RELY-01: verify_node_token returns Node when raw token matches hash."""
    from app import crud
    from app.core.security import get_password_hash
    from app.models import Node
    import uuid

    raw_token = "test-token-for-verification"
    node = Node(
        name="verify-test",
        user_id=uuid.uuid4(),
        token_hash=get_password_hash(raw_token),
    )
    db_session.add(node)
    db_session.commit()

    found = crud.verify_node_token(session=db_session, token=raw_token)
    assert found is not None
    assert found.id == node.id

    not_found = crud.verify_node_token(session=db_session, token="wrong-token")
    assert not_found is None
