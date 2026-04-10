"""Node daemon WebSocket endpoint tests for RELY-01, RELY-04."""
import secrets
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select
from starlette.testclient import TestClient as StarletteTestClient
from starlette.websockets import WebSocketDisconnect

from app import crud
from app.core.security import get_password_hash
from app.models import Node
from tests.utils.user import create_random_user


def _create_node_with_raw_token(db: Session) -> tuple[Node, str]:
    """Create a node with a known raw token for WebSocket auth testing."""
    user = create_random_user(db)
    node, raw_token = crud.create_node_token(
        session=db, user_id=user.id, name="ws-test-node"
    )
    return node, raw_token


def test_node_ws_no_token(client: TestClient) -> None:
    """RELY-01: Connect without token, expect close code 1008."""
    with pytest.raises(Exception):
        with client.websocket_connect("/ws/node") as ws:
            # Server should close immediately
            ws.receive_json()


def test_node_ws_invalid_token(client: TestClient, db: Session) -> None:
    """RELY-01: Connect with bad token, send hello, expect close."""
    with pytest.raises(Exception):
        with client.websocket_connect("/ws/node?token=invalid-token") as ws:
            ws.send_json(
                {
                    "type": "hello",
                    "machineId": "test-machine",
                    "daemonVersion": "1.0",
                    "os": "linux",
                    "arch": "amd64",
                    "lastSequenceBySession": {},
                }
            )
            # Server should close after token verification fails
            ws.receive_json()


def test_node_ws_not_hello_first(client: TestClient, db: Session) -> None:
    """T-03-10: First message must be hello, otherwise close."""
    node, raw_token = _create_node_with_raw_token(db)
    with pytest.raises(Exception):
        with client.websocket_connect(f"/ws/node?token={raw_token}") as ws:
            ws.send_json({"type": "heartbeat", "machineId": "x"})
            ws.receive_json()


def test_node_ws_valid_hello_welcome(client: TestClient, db: Session) -> None:
    """RELY-01: Valid token + hello receives welcome response."""
    node, raw_token = _create_node_with_raw_token(db)
    with client.websocket_connect(f"/ws/node?token={raw_token}") as ws:
        ws.send_json(
            {
                "type": "hello",
                "machineId": "test-machine-123",
                "daemonVersion": "1.0.0",
                "os": "linux",
                "arch": "amd64",
                "lastSequenceBySession": {},
            }
        )
        welcome = ws.receive_json()
        assert welcome["type"] == "welcome"
        assert "ackedSequencesBySession" in welcome


def test_node_ws_hello_updates_node_metadata(
    client: TestClient, db: Session
) -> None:
    """RELY-01: Hello message updates node metadata in DB."""
    node, raw_token = _create_node_with_raw_token(db)
    machine_id = "meta-test-machine"
    with client.websocket_connect(f"/ws/node?token={raw_token}") as ws:
        ws.send_json(
            {
                "type": "hello",
                "machineId": machine_id,
                "daemonVersion": "2.0.0",
                "os": "darwin",
                "arch": "arm64",
                "lastSequenceBySession": {},
            }
        )
        ws.receive_json()  # consume welcome

    # Verify DB was updated
    db.expire_all()
    updated_node = db.exec(
        select(Node).where(Node.machine_id == machine_id)
    ).first()
    assert updated_node is not None
    assert updated_node.daemon_version == "2.0.0"
    assert updated_node.os == "darwin"
    assert updated_node.arch == "arm64"
    assert updated_node.connected_at is not None


def test_node_ws_heartbeat_updates_last_seen(
    client: TestClient, db: Session
) -> None:
    """RELY-04 / D-12: Heartbeat updates last_seen in DB."""
    node, raw_token = _create_node_with_raw_token(db)
    machine_id = "heartbeat-test-machine"
    with client.websocket_connect(f"/ws/node?token={raw_token}") as ws:
        ws.send_json(
            {
                "type": "hello",
                "machineId": machine_id,
                "daemonVersion": "1.0.0",
                "os": "linux",
                "arch": "amd64",
                "lastSequenceBySession": {},
            }
        )
        ws.receive_json()  # consume welcome

        # Record time before heartbeat
        before_heartbeat = datetime.now(timezone.utc)

        ws.send_json(
            {
                "type": "heartbeat",
                "machineId": machine_id,
                "daemonVersion": "1.0.0",
                "status": "online",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )

    # Verify last_seen was updated
    db.expire_all()
    updated_node = db.exec(
        select(Node).where(Node.machine_id == machine_id)
    ).first()
    assert updated_node is not None
    assert updated_node.last_seen is not None
    # last_seen should be at or after before_heartbeat (within reasonable tolerance)
    assert updated_node.last_seen.replace(tzinfo=timezone.utc) >= before_heartbeat.replace(
        microsecond=0
    )


def test_node_ws_disconnect_updates_db(client: TestClient, db: Session) -> None:
    """D-11: Disconnect updates disconnected_at in DB (T-03-15)."""
    node, raw_token = _create_node_with_raw_token(db)
    machine_id = "disconnect-test-machine"
    with client.websocket_connect(f"/ws/node?token={raw_token}") as ws:
        ws.send_json(
            {
                "type": "hello",
                "machineId": machine_id,
                "daemonVersion": "1.0.0",
                "os": "linux",
                "arch": "amd64",
                "lastSequenceBySession": {},
            }
        )
        ws.receive_json()  # consume welcome

    # After disconnect, verify disconnected_at is set
    db.expire_all()
    updated_node = db.exec(
        select(Node).where(Node.machine_id == machine_id)
    ).first()
    assert updated_node is not None
    assert updated_node.disconnected_at is not None
