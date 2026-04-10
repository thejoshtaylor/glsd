"""Browser WebSocket replay tests for SESS-05, RELY-05.

Tests replayRequest handler: session ownership, event streaming,
replayComplete sentinel, control message inclusion, payload fidelity.
"""
import uuid
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session as DBSession

from app import crud
from app.core.security import create_access_token
from app.models import Node, SessionEvent, SessionModel
from tests.utils.user import create_random_user


def _setup_user_node_session(db: DBSession) -> tuple:
    """Create a user, node (with token), and session."""
    user = create_random_user(db)
    node, raw_token = crud.create_node_token(
        session=db, user_id=user.id, name="replay-test-node"
    )
    node.machine_id = f"machine-{uuid.uuid4().hex[:8]}"
    db.add(node)
    db.commit()
    db.refresh(node)
    sess = crud.create_session(
        session=db, user_id=user.id, node_id=node.id, cwd="/tmp/replay"
    )
    assert sess is not None
    return user, node, raw_token, sess


def _make_jwt(user_id: uuid.UUID) -> str:
    return create_access_token(str(user_id), timedelta(minutes=30))


def _insert_events(
    db: DBSession, session_id: uuid.UUID, events: list[tuple[int, str, dict]]
) -> None:
    """Insert SessionEvents. events = [(seq, event_type, payload), ...]"""
    for seq, etype, payload in events:
        ev = SessionEvent(
            session_id=session_id,
            sequence_number=seq,
            event_type=etype,
            payload=payload,
        )
        db.add(ev)
    db.commit()


def test_replay_request(client: TestClient, db: DBSession) -> None:
    """replayRequest with fromSequence=2 returns events 3,4,5 and replayComplete."""
    user, node, _, sess = _setup_user_node_session(db)
    _insert_events(
        db,
        sess.id,
        [
            (1, "stream", {"type": "stream", "data": "a"}),
            (2, "stream", {"type": "stream", "data": "b"}),
            (3, "taskComplete", {"type": "taskComplete", "result": "c"}),
            (4, "stream", {"type": "stream", "data": "d"}),
            (5, "stream", {"type": "stream", "data": "e"}),
        ],
    )

    token = _make_jwt(user.id)
    channel_id = f"ch-{uuid.uuid4().hex[:8]}"

    with client.websocket_connect(
        f"/ws/browser?token={token}&channelId={channel_id}"
    ) as ws:
        ws.send_json(
            {
                "type": "replayRequest",
                "sessionId": str(sess.id),
                "fromSequence": 2,
            }
        )
        # Should receive events with seq 3, 4, 5
        msgs = []
        for _ in range(4):  # 3 events + 1 replayComplete
            msgs.append(ws.receive_json())

    # First 3 messages are the replayed events
    assert msgs[0]["type"] == "taskComplete"
    assert msgs[1]["type"] == "stream"
    assert msgs[2]["type"] == "stream"

    # Last message is replayComplete
    assert msgs[3]["type"] == "replayComplete"
    assert msgs[3]["sessionId"] == str(sess.id)
    assert msgs[3]["lastSequence"] == 5


def test_replay_complete_signal(client: TestClient, db: DBSession) -> None:
    """replayRequest with fromSequence=0 returns all events and replayComplete."""
    user, node, _, sess = _setup_user_node_session(db)
    _insert_events(
        db,
        sess.id,
        [
            (1, "taskStarted", {"type": "taskStarted", "taskId": "t1"}),
            (2, "taskComplete", {"type": "taskComplete", "taskId": "t1"}),
        ],
    )

    token = _make_jwt(user.id)
    channel_id = f"ch-{uuid.uuid4().hex[:8]}"

    with client.websocket_connect(
        f"/ws/browser?token={token}&channelId={channel_id}"
    ) as ws:
        ws.send_json(
            {
                "type": "replayRequest",
                "sessionId": str(sess.id),
                "fromSequence": 0,
            }
        )
        msgs = []
        for _ in range(3):  # 2 events + 1 replayComplete
            msgs.append(ws.receive_json())

    assert msgs[0]["type"] == "taskStarted"
    assert msgs[1]["type"] == "taskComplete"
    assert msgs[2]["type"] == "replayComplete"
    assert msgs[2]["lastSequence"] == 2


def test_replay_includes_control_messages(
    client: TestClient, db: DBSession
) -> None:
    """Control messages (permissionRequest, question) are included in replay."""
    user, node, _, sess = _setup_user_node_session(db)
    _insert_events(
        db,
        sess.id,
        [
            (1, "stream", {"type": "stream", "data": "x"}),
            (
                2,
                "permissionRequest",
                {"type": "permissionRequest", "toolName": "bash"},
            ),
            (3, "question", {"type": "question", "question": "Continue?"}),
            (4, "taskComplete", {"type": "taskComplete"}),
        ],
    )

    token = _make_jwt(user.id)
    channel_id = f"ch-{uuid.uuid4().hex[:8]}"

    with client.websocket_connect(
        f"/ws/browser?token={token}&channelId={channel_id}"
    ) as ws:
        ws.send_json(
            {
                "type": "replayRequest",
                "sessionId": str(sess.id),
                "fromSequence": 0,
            }
        )
        msgs = []
        for _ in range(5):  # 4 events + 1 replayComplete
            msgs.append(ws.receive_json())

    types = [m["type"] for m in msgs[:4]]
    assert "permissionRequest" in types
    assert "question" in types


def test_replay_rejects_unauthorized_session(
    client: TestClient, db: DBSession
) -> None:
    """replayRequest for session owned by different user returns error."""
    user_a, node_a, _, sess_a = _setup_user_node_session(db)
    user_b = create_random_user(db)

    token_b = _make_jwt(user_b.id)
    channel_id = f"ch-{uuid.uuid4().hex[:8]}"

    with client.websocket_connect(
        f"/ws/browser?token={token_b}&channelId={channel_id}"
    ) as ws:
        ws.send_json(
            {
                "type": "replayRequest",
                "sessionId": str(sess_a.id),
                "fromSequence": 0,
            }
        )
        response = ws.receive_json()
        assert response["type"] == "error"
        assert "not found" in response["error"].lower() or "Session not found" in response["error"]


def test_replay_payload_fidelity(client: TestClient, db: DBSession) -> None:
    """Replayed event payloads match original stored payload exactly."""
    user, node, _, sess = _setup_user_node_session(db)
    original_payload = {
        "type": "taskComplete",
        "taskId": "task-123",
        "result": {"summary": "done", "files": ["/a.py", "/b.py"]},
        "metadata": {"duration_ms": 42},
    }
    _insert_events(db, sess.id, [(1, "taskComplete", original_payload)])

    token = _make_jwt(user.id)
    channel_id = f"ch-{uuid.uuid4().hex[:8]}"

    with client.websocket_connect(
        f"/ws/browser?token={token}&channelId={channel_id}"
    ) as ws:
        ws.send_json(
            {
                "type": "replayRequest",
                "sessionId": str(sess.id),
                "fromSequence": 0,
            }
        )
        replayed = ws.receive_json()
        complete = ws.receive_json()

    assert replayed == original_payload
    assert complete["type"] == "replayComplete"
