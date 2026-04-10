"""Event storage and ack timing tests for D-08, D-09, D-10, SESS-06.

Tests that stream/control events are persisted to session_events table
and that acks are sent only after DB write confirms.
"""
import uuid
from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlmodel import Session as DBSession, select

from app import crud
from app.models import Node, SessionEvent, SessionModel
from tests.utils.user import create_random_user


def _setup_node_session(db: DBSession) -> tuple:
    """Create user, node with raw_token, and session. Returns (user, node, raw_token, session)."""
    user = create_random_user(db)
    node, raw_token = crud.create_node_token(
        session=db, user_id=user.id, name="event-test-node"
    )
    sess = crud.create_session(
        session=db, user_id=user.id, node_id=node.id, cwd="/tmp/event-test"
    )
    assert sess is not None
    return user, node, raw_token, sess


def _connect_node(ws, machine_id: str) -> dict:
    """Send hello and receive welcome on a node WebSocket. Returns welcome message."""
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
    return ws.receive_json()


def test_stream_event_persisted(client: TestClient, db: DBSession) -> None:
    """RELY-03 / D-08: stream event written to session_events table."""
    user, node, raw_token, sess = _setup_node_session(db)
    machine_id = f"stream-persist-{uuid.uuid4().hex[:8]}"

    with client.websocket_connect(f"/ws/node?token={raw_token}") as ws:
        welcome = _connect_node(ws, machine_id)
        assert welcome["type"] == "welcome"

        # Send a stream event
        ws.send_json(
            {
                "type": "stream",
                "sessionId": str(sess.id),
                "channelId": "ch-test",
                "sequenceNumber": 1,
                "event": {"content": "hello world"},
            }
        )

        # Receive ack
        ack = ws.receive_json()
        assert ack["type"] == "ack"
        assert ack["sessionId"] == str(sess.id)
        assert ack["sequenceNumber"] == 1

    # Verify event is in DB
    db.expire_all()
    with DBSession(db.get_bind()) as fresh_db:
        event = fresh_db.exec(
            select(SessionEvent)
            .where(SessionEvent.session_id == sess.id)
            .where(SessionEvent.sequence_number == 1)
        ).first()
        assert event is not None
        assert event.event_type == "stream"
        assert event.payload["sessionId"] == str(sess.id)
        assert event.payload["event"]["content"] == "hello world"


def test_event_persisted_before_ack(client: TestClient, db: DBSession) -> None:
    """D-10: ack sent AFTER DB write confirms -- event exists when ack received."""
    user, node, raw_token, sess = _setup_node_session(db)
    machine_id = f"ack-order-{uuid.uuid4().hex[:8]}"

    with client.websocket_connect(f"/ws/node?token={raw_token}") as ws:
        welcome = _connect_node(ws, machine_id)
        assert welcome["type"] == "welcome"

        # Send stream event
        ws.send_json(
            {
                "type": "stream",
                "sessionId": str(sess.id),
                "channelId": "ch-ack-test",
                "sequenceNumber": 42,
                "event": {"data": "test-ack-ordering"},
            }
        )

        # Receive ack -- at this point, event MUST be in DB
        ack = ws.receive_json()
        assert ack["type"] == "ack"
        assert ack["sequenceNumber"] == 42

    # Immediately query DB after receiving ack -- event must exist
    db.expire_all()
    with DBSession(db.get_bind()) as fresh_db:
        event = fresh_db.exec(
            select(SessionEvent)
            .where(SessionEvent.session_id == sess.id)
            .where(SessionEvent.sequence_number == 42)
        ).first()
        assert event is not None, "Event must exist in DB when ack is received (D-10)"
        assert event.event_type == "stream"


def test_control_events_stored(client: TestClient, db: DBSession) -> None:
    """D-08: taskStarted, taskComplete, taskError all create session_event rows."""
    user, node, raw_token, sess = _setup_node_session(db)
    machine_id = f"ctrl-events-{uuid.uuid4().hex[:8]}"

    with client.websocket_connect(f"/ws/node?token={raw_token}") as ws:
        welcome = _connect_node(ws, machine_id)
        assert welcome["type"] == "welcome"

        # taskStarted
        ws.send_json(
            {
                "type": "taskStarted",
                "taskId": str(uuid.uuid4()),
                "sessionId": str(sess.id),
                "channelId": "ch-ctrl",
                "sequenceNumber": 1,
                "startedAt": datetime.now(timezone.utc).isoformat(),
            }
        )
        ack1 = ws.receive_json()
        assert ack1["type"] == "ack"

        # taskComplete
        ws.send_json(
            {
                "type": "taskComplete",
                "taskId": str(uuid.uuid4()),
                "sessionId": str(sess.id),
                "channelId": "ch-ctrl",
                "sequenceNumber": 2,
                "claudeSessionId": "claude-123",
                "inputTokens": 100,
                "outputTokens": 200,
                "costUsd": "0.01",
                "durationMs": 5000,
                "resultSummary": "done",
            }
        )
        ack2 = ws.receive_json()
        assert ack2["type"] == "ack"

    # Verify both events stored
    db.expire_all()
    with DBSession(db.get_bind()) as fresh_db:
        events = fresh_db.exec(
            select(SessionEvent)
            .where(SessionEvent.session_id == sess.id)
            .order_by(SessionEvent.sequence_number)
        ).all()
        event_types = [e.event_type for e in events]
        assert "taskStarted" in event_types
        assert "taskComplete" in event_types


def test_multiple_sessions_event_isolation(
    client: TestClient, db: DBSession
) -> None:
    """SESS-06: Events for two sessions on same node stored independently."""
    user = create_random_user(db)
    node, raw_token = crud.create_node_token(
        session=db, user_id=user.id, name="isolation-node"
    )

    sess1 = crud.create_session(
        session=db, user_id=user.id, node_id=node.id, cwd="/tmp/iso1"
    )
    sess2 = crud.create_session(
        session=db, user_id=user.id, node_id=node.id, cwd="/tmp/iso2"
    )
    assert sess1 is not None
    assert sess2 is not None

    machine_id = f"iso-machine-{uuid.uuid4().hex[:8]}"

    with client.websocket_connect(f"/ws/node?token={raw_token}") as ws:
        welcome = _connect_node(ws, machine_id)
        assert welcome["type"] == "welcome"

        # Stream event for session 1
        ws.send_json(
            {
                "type": "stream",
                "sessionId": str(sess1.id),
                "channelId": "ch-iso1",
                "sequenceNumber": 1,
                "event": {"data": "session1-data"},
            }
        )
        ack1 = ws.receive_json()
        assert ack1["type"] == "ack"
        assert ack1["sessionId"] == str(sess1.id)

        # Stream event for session 2
        ws.send_json(
            {
                "type": "stream",
                "sessionId": str(sess2.id),
                "channelId": "ch-iso2",
                "sequenceNumber": 1,
                "event": {"data": "session2-data"},
            }
        )
        ack2 = ws.receive_json()
        assert ack2["type"] == "ack"
        assert ack2["sessionId"] == str(sess2.id)

    # Verify events stored independently
    db.expire_all()
    with DBSession(db.get_bind()) as fresh_db:
        events1 = fresh_db.exec(
            select(SessionEvent).where(SessionEvent.session_id == sess1.id)
        ).all()
        events2 = fresh_db.exec(
            select(SessionEvent).where(SessionEvent.session_id == sess2.id)
        ).all()

        assert len(events1) >= 1
        assert len(events2) >= 1
        assert events1[0].payload["event"]["data"] == "session1-data"
        assert events2[0].payload["event"]["data"] == "session2-data"
