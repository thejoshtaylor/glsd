"""Tests for handoff relay routing functions.

Stubs both the DB session (via patch of DBSession) and ConnectionManager
so no real database or WebSocket is required.
"""
import asyncio
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

from app.relay.handoff_relay import route_handoff_ready, route_handoff_ack
from app.models import HandoffPair, Node


def _make_pair(node_a_id, node_b_id, pair_id, active_node_id=None):
    pair = MagicMock(spec=HandoffPair)
    pair.id = pair_id
    pair.node_a_id = node_a_id
    pair.node_b_id = node_b_id
    pair.active_node_id = active_node_id if active_node_id is not None else node_b_id
    pair.last_branch_ref = None
    pair.last_handoff_at = None
    return pair


def _make_db_session(query_results):
    """Build a mock DB session context manager returning query_results in order."""
    db = MagicMock()
    exec_mock = MagicMock()
    exec_mock.first.side_effect = list(query_results)
    db.exec.return_value = exec_mock
    db.__enter__ = MagicMock(return_value=db)
    db.__exit__ = MagicMock(return_value=False)
    return db


def test_route_handoff_ready_forwards_signal():
    node_a_id = uuid.uuid4()
    node_b_id = uuid.uuid4()
    pair_id = uuid.uuid4()

    pair = _make_pair(node_a_id, node_b_id, pair_id)
    node_b = MagicMock(spec=Node)
    node_b.id = node_b_id
    node_b.machine_id = "machine-b"

    authenticated_node = MagicMock(spec=Node)
    authenticated_node.id = node_a_id

    db = _make_db_session([pair, node_b])

    msg = {
        "type": "handoffReady",
        "pairId": str(pair_id),
        "branchRef": "gsd/handoff/handoff",
        "commitSha": "abc123",
        "sessionId": "sess-1",
    }

    with patch("app.relay.handoff_relay.DBSession", return_value=db):
        with patch("app.relay.handoff_relay.manager") as mock_manager:
            mock_manager.send_to_node = AsyncMock(return_value=True)
            asyncio.run(route_handoff_ready(msg, authenticated_node))

    mock_manager.send_to_node.assert_called_once()
    call_args = mock_manager.send_to_node.call_args[0]
    assert call_args[0] == "machine-b"
    signal = call_args[1]
    assert signal["type"] == "handoffSignal"
    assert signal["branchRef"] == "gsd/handoff/handoff"
    assert signal["commitSha"] == "abc123"
    db.commit.assert_called_once()


def test_route_handoff_ready_rejects_wrong_sender():
    """If authenticated_node is not node_a, no DB commit or signal sent."""
    node_a_id = uuid.uuid4()
    node_b_id = uuid.uuid4()
    pair_id = uuid.uuid4()

    pair = _make_pair(node_a_id, node_b_id, pair_id)
    wrong_node = MagicMock(spec=Node)
    wrong_node.id = uuid.uuid4()

    db = _make_db_session([pair])

    msg = {"type": "handoffReady", "pairId": str(pair_id)}

    with patch("app.relay.handoff_relay.DBSession", return_value=db):
        with patch("app.relay.handoff_relay.manager") as mock_manager:
            mock_manager.send_to_node = AsyncMock()
            asyncio.run(route_handoff_ready(msg, wrong_node))

    mock_manager.send_to_node.assert_not_called()
    db.commit.assert_not_called()


def test_route_handoff_ready_pair_not_found():
    """Missing pair returns early without error."""
    authenticated_node = MagicMock(spec=Node)
    authenticated_node.id = uuid.uuid4()

    db = _make_db_session([None])
    msg = {"type": "handoffReady", "pairId": str(uuid.uuid4())}

    with patch("app.relay.handoff_relay.DBSession", return_value=db):
        with patch("app.relay.handoff_relay.manager") as mock_manager:
            mock_manager.send_to_node = AsyncMock()
            asyncio.run(route_handoff_ready(msg, authenticated_node))

    mock_manager.send_to_node.assert_not_called()


def test_route_handoff_ack_updates_timestamp():
    node_b_id = uuid.uuid4()
    pair_id = uuid.uuid4()

    pair = _make_pair(uuid.uuid4(), node_b_id, pair_id, active_node_id=node_b_id)
    authenticated_node = MagicMock(spec=Node)
    authenticated_node.id = node_b_id

    db = _make_db_session([pair])
    msg = {"type": "handoffAck", "pairId": str(pair_id)}

    with patch("app.relay.handoff_relay.DBSession", return_value=db):
        asyncio.run(route_handoff_ack(msg, authenticated_node))

    assert pair.last_handoff_at is not None
    db.commit.assert_called_once()


def test_route_handoff_ack_rejects_wrong_active_node():
    """If authenticated_node is not active_node, no commit."""
    node_b_id = uuid.uuid4()
    pair_id = uuid.uuid4()

    pair = _make_pair(uuid.uuid4(), node_b_id, pair_id, active_node_id=node_b_id)
    wrong_node = MagicMock(spec=Node)
    wrong_node.id = uuid.uuid4()

    db = _make_db_session([pair])
    msg = {"type": "handoffAck", "pairId": str(pair_id)}

    with patch("app.relay.handoff_relay.DBSession", return_value=db):
        asyncio.run(route_handoff_ack(msg, wrong_node))

    db.commit.assert_not_called()


def test_route_handoff_ack_pair_not_found():
    """Missing pair returns early without error."""
    authenticated_node = MagicMock(spec=Node)
    authenticated_node.id = uuid.uuid4()

    db = _make_db_session([None])
    msg = {"type": "handoffAck", "pairId": str(uuid.uuid4())}

    with patch("app.relay.handoff_relay.DBSession", return_value=db):
        asyncio.run(route_handoff_ack(msg, authenticated_node))

    db.commit.assert_not_called()
