"""Tests for gsd2Query / gsd2QueryResult relay routing (R004).

Browser-side tests verify that gsd2Query messages are:
  - Anti-spoofed (channelId overwritten with authenticated value)
  - Forwarded to the target node by machineId
  - Rejected with error when machineId is missing or node is offline

Node-side tests verify that gsd2QueryResult messages:
  - Resolve a pending response future via manager.resolve_response
  - Also forward to the browser channel when channelId != requestId (relay pattern)
  - Do NOT forward to browser when channelId == requestId (REST pending-response pattern)
"""
import uuid
from datetime import timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session as DBSession

from app import crud
from app.core.security import create_access_token
from app.models import Node
from tests.utils.user import create_random_user


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_jwt(user_id: uuid.UUID) -> str:
    return create_access_token(str(user_id), timedelta(minutes=30))


def _create_node_with_raw_token(db: DBSession) -> tuple[Node, str]:
    user = create_random_user(db)
    node, raw_token = crud.create_node_token(
        session=db, user_id=user.id, name="gsd2-test-node"
    )
    return node, raw_token


def _hello_payload(machine_id: str) -> dict:
    return {
        "type": "hello",
        "machineId": machine_id,
        "daemonVersion": "1.0.0",
        "os": "linux",
        "arch": "amd64",
        "lastSequenceBySession": {},
    }


# ---------------------------------------------------------------------------
# Browser → node: gsd2Query routing
# ---------------------------------------------------------------------------

def test_gsd2query_routed_to_node(client: TestClient, db: DBSession) -> None:
    """gsd2Query is forwarded to manager.send_to_node with anti-spoofed channelId."""
    user = create_random_user(db)
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
                    "type": "gsd2Query",
                    "machineId": "target-node-abc",
                    "channelId": "spoofed-channel",  # must be overwritten
                    "command": "gsd status",
                    "requestId": "req-001",
                }
            )

    assert mock_send.called
    call_args = mock_send.call_args
    assert call_args[0][0] == "target-node-abc"
    forwarded = call_args[0][1]
    # Anti-spoofing: channelId must equal the authenticated channel, not the browser-supplied value
    assert forwarded["channelId"] == channel_id
    assert forwarded["type"] == "gsd2Query"


def test_gsd2query_node_offline(client: TestClient, db: DBSession) -> None:
    """gsd2Query with offline node returns error to browser."""
    user = create_random_user(db)
    token = _make_jwt(user.id)
    channel_id = f"ch-{uuid.uuid4().hex[:8]}"

    with patch(
        "app.api.routes.ws_browser.manager.send_to_node",
        new_callable=AsyncMock,
        return_value=False,  # node is offline
    ):
        with client.websocket_connect(
            f"/ws/browser?token={token}&channelId={channel_id}"
        ) as ws:
            ws.send_json(
                {
                    "type": "gsd2Query",
                    "machineId": "offline-node",
                    "command": "gsd status",
                    "requestId": "req-002",
                }
            )
            response = ws.receive_json()

    assert response["type"] == "error"
    assert "offline-node" in response["message"]


def test_gsd2query_missing_machineid(client: TestClient, db: DBSession) -> None:
    """gsd2Query without machineId returns error; send_to_node is NOT called."""
    user = create_random_user(db)
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
                    "type": "gsd2Query",
                    # machineId intentionally omitted
                    "command": "gsd status",
                    "requestId": "req-003",
                }
            )
            response = ws.receive_json()

    assert response["type"] == "error"
    assert "machineId" in response["message"]
    mock_send.assert_not_called()


# ---------------------------------------------------------------------------
# Node → browser: gsd2QueryResult routing
# ---------------------------------------------------------------------------

def test_gsd2queryresult_resolves_pending(client: TestClient, db: DBSession) -> None:
    """gsd2QueryResult with channelId != requestId calls resolve_response AND send_to_browser."""
    node, raw_token = _create_node_with_raw_token(db)
    machine_id = f"gsd2-result-{uuid.uuid4().hex[:8]}"

    with patch(
        "app.api.routes.ws_node.manager.resolve_response"
    ) as mock_resolve, patch(
        "app.api.routes.ws_node.manager.send_to_browser",
        new_callable=AsyncMock,
        return_value=True,
    ) as mock_send_browser:
        with client.websocket_connect(f"/ws/node?token={raw_token}") as ws:
            ws.send_json(_hello_payload(machine_id))
            ws.receive_json()  # consume welcome

            ws.send_json(
                {
                    "type": "gsd2QueryResult",
                    "requestId": "req-123",
                    "channelId": "ch-456",  # different from requestId -> both called
                    "result": {"status": "ok"},
                }
            )

    mock_resolve.assert_called_once_with("req-123", {
        "type": "gsd2QueryResult",
        "requestId": "req-123",
        "channelId": "ch-456",
        "result": {"status": "ok"},
    })
    mock_send_browser.assert_called_once_with("ch-456", {
        "type": "gsd2QueryResult",
        "requestId": "req-123",
        "channelId": "ch-456",
        "result": {"status": "ok"},
    })


def test_gsd2queryresult_same_id_no_browser_forward(
    client: TestClient, db: DBSession
) -> None:
    """gsd2QueryResult with channelId == requestId calls resolve_response; send_to_browser NOT called."""
    node, raw_token = _create_node_with_raw_token(db)
    machine_id = f"gsd2-same-{uuid.uuid4().hex[:8]}"

    with patch(
        "app.api.routes.ws_node.manager.resolve_response"
    ) as mock_resolve, patch(
        "app.api.routes.ws_node.manager.send_to_browser",
        new_callable=AsyncMock,
        return_value=True,
    ) as mock_send_browser:
        with client.websocket_connect(f"/ws/node?token={raw_token}") as ws:
            ws.send_json(_hello_payload(machine_id))
            ws.receive_json()  # consume welcome

            ws.send_json(
                {
                    "type": "gsd2QueryResult",
                    "requestId": "same-id-xyz",
                    "channelId": "same-id-xyz",  # same as requestId -> no browser forward
                    "result": {"data": "value"},
                }
            )

    mock_resolve.assert_called_once_with("same-id-xyz", {
        "type": "gsd2QueryResult",
        "requestId": "same-id-xyz",
        "channelId": "same-id-xyz",
        "result": {"data": "value"},
    })
    mock_send_browser.assert_not_called()
