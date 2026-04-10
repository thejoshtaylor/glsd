"""Browser WebSocket relay tests for RELY-02, RELY-03, SESS-06.

Tests JWT auth, session ownership validation, and message routing
via the /ws/browser endpoint.
"""
import uuid
from datetime import timedelta
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session as DBSession

from app import crud
from app.core.security import create_access_token
from app.models import Node, SessionModel
from tests.utils.user import create_random_user


def _setup_user_node_session(db: DBSession) -> tuple:
    """Create a user, node (with token), and session. Returns (user, node, raw_token, session)."""
    user = create_random_user(db)
    node, raw_token = crud.create_node_token(
        session=db, user_id=user.id, name="browser-test-node"
    )
    # Set machine_id so the node is "connected"
    node.machine_id = f"machine-{uuid.uuid4().hex[:8]}"
    db.add(node)
    db.commit()
    db.refresh(node)

    sess = crud.create_session(
        session=db, user_id=user.id, node_id=node.id, cwd="/tmp/test"
    )
    assert sess is not None
    return user, node, raw_token, sess


def _make_jwt(user_id: uuid.UUID) -> str:
    """Generate a valid JWT for the given user."""
    return create_access_token(str(user_id), timedelta(minutes=30))


def test_browser_ws_jwt_auth(client: TestClient, db: DBSession) -> None:
    """RELY-03 / D-06: Browser WS with valid JWT connects; invalid JWT rejected."""
    user = create_random_user(db)
    token = _make_jwt(user.id)
    channel_id = f"ch-{uuid.uuid4().hex[:8]}"

    # Valid JWT should connect successfully
    with client.websocket_connect(
        f"/ws/browser?token={token}&channelId={channel_id}"
    ) as ws:
        # Connection accepted -- we can close gracefully
        pass

    # Invalid JWT should raise (server closes with 1008)
    with pytest.raises(Exception):
        with client.websocket_connect(
            "/ws/browser?token=invalid-jwt-token&channelId=ch1"
        ) as ws:
            ws.receive_json()


def test_browser_ws_missing_channel_id(client: TestClient, db: DBSession) -> None:
    """RELY-03: Browser WS with missing channelId gets close(1008)."""
    user = create_random_user(db)
    token = _make_jwt(user.id)

    with pytest.raises(Exception):
        with client.websocket_connect(f"/ws/browser?token={token}") as ws:
            ws.receive_json()


def test_browser_ws_missing_token(client: TestClient) -> None:
    """RELY-03: Browser WS with missing token gets close(1008)."""
    with pytest.raises(Exception):
        with client.websocket_connect("/ws/browser?channelId=ch1") as ws:
            ws.receive_json()


def test_browser_ws_task_validates_session_ownership(
    client: TestClient, db: DBSession
) -> None:
    """RELY-02: Task message for session NOT owned by user returns error."""
    # Create user A's session
    user_a, node_a, _, sess_a = _setup_user_node_session(db)

    # Create user B (different user)
    user_b = create_random_user(db)
    token_b = _make_jwt(user_b.id)
    channel_id = f"ch-{uuid.uuid4().hex[:8]}"

    with client.websocket_connect(
        f"/ws/browser?token={token_b}&channelId={channel_id}"
    ) as ws:
        # User B tries to send task for user A's session
        ws.send_json(
            {
                "type": "task",
                "taskId": str(uuid.uuid4()),
                "sessionId": str(sess_a.id),
                "channelId": channel_id,
                "prompt": "test",
                "model": "claude-sonnet-4-20250514",
                "effort": "low",
                "permissionMode": "auto",
                "cwd": "/tmp",
            }
        )
        response = ws.receive_json()
        assert response["type"] == "error"
        assert response["error"] == "Session not found"


def test_browser_ws_task_forwarding(client: TestClient, db: DBSession) -> None:
    """RELY-02: Task message is forwarded to correct node via ConnectionManager."""
    user, node, _, sess = _setup_user_node_session(db)
    token = _make_jwt(user.id)
    channel_id = f"ch-{uuid.uuid4().hex[:8]}"

    with patch(
        "app.api.routes.ws_browser.manager.send_to_node",
        new_callable=AsyncMock,
        return_value=True,
    ) as mock_send:
        with client.websocket_connect(
            f"/ws/browser?token={token}&channelId={channel_id}"
        ) as ws:
            ws.send_json(
                {
                    "type": "task",
                    "taskId": str(uuid.uuid4()),
                    "sessionId": str(sess.id),
                    "channelId": "spoofed-channel",  # Should be overwritten
                    "prompt": "hello",
                    "model": "claude-sonnet-4-20250514",
                    "effort": "low",
                    "permissionMode": "auto",
                    "cwd": "/tmp",
                }
            )

        # Verify send_to_node was called with the correct machine_id
        assert mock_send.called
        call_args = mock_send.call_args
        assert call_args[0][0] == node.machine_id  # correct machine_id
        forwarded_msg = call_args[0][1]
        # T-03-19: channelId must be the authenticated one, not the spoofed one
        assert forwarded_msg["channelId"] == channel_id


def test_browser_ws_task_missing_session_id(
    client: TestClient, db: DBSession
) -> None:
    """Task message without sessionId returns error."""
    user = create_random_user(db)
    token = _make_jwt(user.id)
    channel_id = f"ch-{uuid.uuid4().hex[:8]}"

    with client.websocket_connect(
        f"/ws/browser?token={token}&channelId={channel_id}"
    ) as ws:
        ws.send_json({"type": "task", "prompt": "test"})
        response = ws.receive_json()
        assert response["type"] == "error"
        assert response["error"] == "Missing sessionId"


def test_multiple_sessions_same_node(client: TestClient, db: DBSession) -> None:
    """SESS-06: Multiple sessions on same node route independently."""
    user = create_random_user(db)
    node, raw_token = crud.create_node_token(
        session=db, user_id=user.id, name="multi-sess-node"
    )
    node.machine_id = f"machine-multi-{uuid.uuid4().hex[:8]}"
    db.add(node)
    db.commit()
    db.refresh(node)

    # Create two sessions on the same node
    sess1 = crud.create_session(
        session=db, user_id=user.id, node_id=node.id, cwd="/tmp/sess1"
    )
    sess2 = crud.create_session(
        session=db, user_id=user.id, node_id=node.id, cwd="/tmp/sess2"
    )
    assert sess1 is not None
    assert sess2 is not None

    token = _make_jwt(user.id)
    ch1 = f"ch-{uuid.uuid4().hex[:8]}"
    ch2 = f"ch-{uuid.uuid4().hex[:8]}"

    forwarded_messages: list[tuple[str, dict]] = []

    async def capture_send(machine_id: str, message: dict) -> bool:
        forwarded_messages.append((machine_id, message))
        return True

    with patch(
        "app.api.routes.ws_browser.manager.send_to_node",
        side_effect=capture_send,
    ):
        # Browser 1 sends task for session 1
        with client.websocket_connect(
            f"/ws/browser?token={token}&channelId={ch1}"
        ) as ws1:
            ws1.send_json(
                {
                    "type": "task",
                    "taskId": str(uuid.uuid4()),
                    "sessionId": str(sess1.id),
                    "channelId": ch1,
                    "prompt": "task for sess1",
                    "model": "claude-sonnet-4-20250514",
                    "effort": "low",
                    "permissionMode": "auto",
                    "cwd": "/tmp/sess1",
                }
            )

        # Browser 2 sends task for session 2
        with client.websocket_connect(
            f"/ws/browser?token={token}&channelId={ch2}"
        ) as ws2:
            ws2.send_json(
                {
                    "type": "task",
                    "taskId": str(uuid.uuid4()),
                    "sessionId": str(sess2.id),
                    "channelId": ch2,
                    "prompt": "task for sess2",
                    "model": "claude-sonnet-4-20250514",
                    "effort": "low",
                    "permissionMode": "auto",
                    "cwd": "/tmp/sess2",
                }
            )

    # Both messages should have been forwarded to the same machine
    assert len(forwarded_messages) == 2
    assert forwarded_messages[0][0] == node.machine_id
    assert forwarded_messages[1][0] == node.machine_id
    # But with different channelIds and sessionIds
    assert forwarded_messages[0][1]["channelId"] == ch1
    assert forwarded_messages[1][1]["channelId"] == ch2
    assert forwarded_messages[0][1]["sessionId"] == str(sess1.id)
    assert forwarded_messages[1][1]["sessionId"] == str(sess2.id)
