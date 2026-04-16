"""Unit tests for gsd2Query / gsd2QueryResult relay routing.

These tests patch the ConnectionManager so they run without a real database or
running WebSocket server.  All five paths from the slice spec are covered:

  1. gsd2Query routed to node when node is online
  2. gsd2Query returns error when node is offline
  3. gsd2Query returns error when machineId is missing
  4. gsd2QueryResult resolves pending future + forwards to browser channel
  5. gsd2QueryResult with no channelId only resolves future (no browser forward)
"""
from unittest.mock import AsyncMock, MagicMock, patch
import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_ws(recv_sequence: list[dict]) -> AsyncMock:
    """Return a mock WebSocket that yields messages from recv_sequence then stops."""
    ws = AsyncMock()
    # receive_json returns each item in sequence, then raises WebSocketDisconnect
    from starlette.websockets import WebSocketDisconnect
    ws.receive_json.side_effect = [*recv_sequence, WebSocketDisconnect()]
    ws.send_json = AsyncMock()
    ws.query_params = {"channelId": "chan-abc", "token": "tok"}
    ws.cookies = {}
    ws.headers = {}
    return ws


def _make_manager(*, node_online: bool = True) -> MagicMock:
    mgr = MagicMock()
    mgr.register_browser = AsyncMock()
    mgr.unregister_browser = AsyncMock()
    mgr.register_node = AsyncMock()
    mgr.unregister_node = AsyncMock()
    mgr.send_to_node = AsyncMock(return_value=node_online)
    mgr.send_to_browser = AsyncMock()
    mgr.resolve_response = MagicMock()
    mgr.get_node = MagicMock(return_value=None)
    return mgr


# ---------------------------------------------------------------------------
# ws_browser: gsd2Query routing
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_gsd2query_routed_to_node() -> None:
    """gsd2Query with machineId is forwarded to the target node."""
    from app.api.routes.ws_browser import ws_browser

    msg = {"type": "gsd2Query", "machineId": "node-1", "query": "milestones"}
    ws = _make_ws([msg])
    mgr = _make_manager(node_online=True)

    with (
        patch("app.api.routes.ws_browser.manager", mgr),
        patch("app.api.routes.ws_browser.pyjwt.decode", return_value={"sub": "user-1"}),
        patch("app.api.routes.ws_browser.DBSession") as MockSession,
    ):
        mock_db = MagicMock()
        mock_user = MagicMock(is_active=True)
        mock_db.get.return_value = mock_user
        MockSession.return_value.__enter__ = MagicMock(return_value=mock_db)
        MockSession.return_value.__exit__ = MagicMock(return_value=False)

        await ws_browser(ws)

    # channelId must be overwritten and forwarded to the correct node
    call_args = mgr.send_to_node.call_args
    assert call_args is not None
    sent_machine_id, sent_msg = call_args[0]
    assert sent_machine_id == "node-1"
    assert sent_msg["channelId"] == "chan-abc"
    assert sent_msg["type"] == "gsd2Query"
    ws.send_json.assert_not_awaited()  # no error response


@pytest.mark.asyncio
async def test_gsd2query_node_offline() -> None:
    """gsd2Query returns an error when the target node is offline."""
    from app.api.routes.ws_browser import ws_browser

    msg = {"type": "gsd2Query", "machineId": "offline-node", "query": "milestones"}
    ws = _make_ws([msg])
    mgr = _make_manager(node_online=False)

    with (
        patch("app.api.routes.ws_browser.manager", mgr),
        patch("app.api.routes.ws_browser.pyjwt.decode", return_value={"sub": "user-1"}),
        patch("app.api.routes.ws_browser.DBSession") as MockSession,
    ):
        mock_db = MagicMock()
        mock_user = MagicMock(is_active=True)
        mock_db.get.return_value = mock_user
        MockSession.return_value.__enter__ = MagicMock(return_value=mock_db)
        MockSession.return_value.__exit__ = MagicMock(return_value=False)

        await ws_browser(ws)

    ws.send_json.assert_awaited_once()
    err = ws.send_json.call_args[0][0]
    assert err["type"] == "error"
    assert "offline" in err["error"].lower()


@pytest.mark.asyncio
async def test_gsd2query_missing_machineid() -> None:
    """gsd2Query without machineId returns a validation error."""
    from app.api.routes.ws_browser import ws_browser

    msg = {"type": "gsd2Query", "query": "milestones"}  # no machineId
    ws = _make_ws([msg])
    mgr = _make_manager()

    with (
        patch("app.api.routes.ws_browser.manager", mgr),
        patch("app.api.routes.ws_browser.pyjwt.decode", return_value={"sub": "user-1"}),
        patch("app.api.routes.ws_browser.DBSession") as MockSession,
    ):
        mock_db = MagicMock()
        mock_user = MagicMock(is_active=True)
        mock_db.get.return_value = mock_user
        MockSession.return_value.__enter__ = MagicMock(return_value=mock_db)
        MockSession.return_value.__exit__ = MagicMock(return_value=False)

        await ws_browser(ws)

    ws.send_json.assert_awaited_once()
    err = ws.send_json.call_args[0][0]
    assert err["type"] == "error"
    assert "machineId" in err["error"]
    mgr.send_to_node.assert_not_awaited()


# ---------------------------------------------------------------------------
# ws_node: gsd2QueryResult routing
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_gsd2queryresult_resolves_and_forwards() -> None:
    """gsd2QueryResult resolves the pending future AND forwards to browser channel."""
    from app.api.routes.ws_node import ws_node

    result_msg = {
        "type": "gsd2QueryResult",
        "requestId": "req-42",
        "channelId": "chan-abc",
        "data": {"milestones": []},
    }
    ws = _make_ws([result_msg])
    # Make ws look like a valid authenticated node connection
    ws.query_params = {"token": "valid-tok"}
    ws.headers = {}

    mgr = _make_manager()

    with (
        patch("app.api.routes.ws_node.manager", mgr),
        patch("app.api.routes.ws_node.crud") as mock_crud,
        patch("app.api.routes.ws_node.DBSession") as MockSession,
    ):
        mock_db = MagicMock()
        mock_node = MagicMock()
        mock_node.id = "node-id-1"
        mock_node.is_revoked = False
        mock_node.machine_id = "machine-1"
        mock_node.user_id = "user-1"
        mock_crud.verify_node_token.return_value = mock_node
        mock_db.get.return_value = mock_node
        mock_db.exec.return_value.all.return_value = []
        mock_db.exec.return_value.first.return_value = mock_node
        MockSession.return_value.__enter__ = MagicMock(return_value=mock_db)
        MockSession.return_value.__exit__ = MagicMock(return_value=False)

        # Provide valid hello message
        hello = {
            "type": "hello",
            "machineId": "machine-1",
            "daemonVersion": "1.0.0",
            "os": "linux",
            "arch": "amd64",
            "lastSequenceBySession": {},
        }
        ws.receive_json.side_effect = [hello, result_msg, Exception("disconnect")]

        await ws_node(ws)

    mgr.resolve_response.assert_called_once_with("req-42", result_msg)
    mgr.send_to_browser.assert_awaited_once_with("chan-abc", result_msg)


@pytest.mark.asyncio
async def test_gsd2queryresult_no_channel_no_forward() -> None:
    """gsd2QueryResult without channelId only resolves future, no browser forward."""
    from app.api.routes.ws_node import ws_node

    result_msg = {
        "type": "gsd2QueryResult",
        "requestId": "req-99",
        # no channelId
        "data": {"milestones": []},
    }
    ws = _make_ws([result_msg])
    ws.query_params = {"token": "valid-tok"}
    ws.headers = {}

    mgr = _make_manager()

    with (
        patch("app.api.routes.ws_node.manager", mgr),
        patch("app.api.routes.ws_node.crud") as mock_crud,
        patch("app.api.routes.ws_node.DBSession") as MockSession,
    ):
        mock_db = MagicMock()
        mock_node = MagicMock()
        mock_node.id = "node-id-2"
        mock_node.is_revoked = False
        mock_node.machine_id = "machine-2"
        mock_node.user_id = "user-2"
        mock_crud.verify_node_token.return_value = mock_node
        mock_db.get.return_value = mock_node
        mock_db.exec.return_value.all.return_value = []
        mock_db.exec.return_value.first.return_value = mock_node
        MockSession.return_value.__enter__ = MagicMock(return_value=mock_db)
        MockSession.return_value.__exit__ = MagicMock(return_value=False)

        hello = {
            "type": "hello",
            "machineId": "machine-2",
            "daemonVersion": "1.0.0",
            "os": "linux",
            "arch": "amd64",
            "lastSequenceBySession": {},
        }
        ws.receive_json.side_effect = [hello, result_msg, Exception("disconnect")]

        await ws_node(ws)

    mgr.resolve_response.assert_called_once_with("req-99", result_msg)
    mgr.send_to_browser.assert_not_awaited()
