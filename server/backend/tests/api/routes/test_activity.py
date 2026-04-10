"""Activity endpoint tests for VIBE-06.

Tests GET /api/v1/activity REST endpoint and ACTIVITY_EVENT_TYPES filtering.
"""
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session as DBSession

from app import crud
from app.core.config import settings
from app.models import Node, SessionEvent, SessionModel
from app.relay.broadcaster import ACTIVITY_EVENT_TYPES
from tests.utils.user import create_random_user, user_authentication_headers
from tests.utils.utils import random_lower_string


def _setup_user_with_session_and_events(
    db: DBSession,
    event_specs: list[tuple[int, str, dict]],
) -> tuple:
    """Create a user, node, session, and insert events.
    Returns (user, password, session)."""
    from app.models import UserCreate

    email = f"activity-{uuid.uuid4().hex[:8]}@test.com"
    password = random_lower_string()
    user = crud.create_user(
        session=db, user_create=UserCreate(email=email, password=password)
    )
    node, _ = crud.create_node_token(
        session=db, user_id=user.id, name="activity-test-node"
    )
    node.machine_id = f"machine-{uuid.uuid4().hex[:8]}"
    db.add(node)
    db.commit()
    db.refresh(node)

    sess = crud.create_session(
        session=db, user_id=user.id, node_id=node.id, cwd="/tmp/activity"
    )
    assert sess is not None

    for seq, etype, payload in event_specs:
        ev = SessionEvent(
            session_id=sess.id,
            sequence_number=seq,
            event_type=etype,
            payload=payload,
        )
        db.add(ev)
    db.commit()

    return user, password, email, sess


def test_get_activity(client: TestClient, db: DBSession) -> None:
    """GET /api/v1/activity returns only D-08 qualifying event types."""
    user, password, email, sess = _setup_user_with_session_and_events(
        db,
        [
            (1, "taskComplete", {"type": "taskComplete"}),
            (2, "stream", {"type": "stream", "data": "raw"}),
            (3, "question", {"type": "question", "question": "Continue?"}),
        ],
    )
    headers = user_authentication_headers(
        client=client, email=email, password=password
    )

    response = client.get(f"{settings.API_V1_STR}/activity", headers=headers)
    assert response.status_code == 200
    data = response.json()
    # "stream" should be excluded per D-08 filtering
    event_types = [e["event_type"] for e in data]
    assert "taskComplete" in event_types
    assert "question" in event_types
    assert "stream" not in event_types
    assert len(data) == 2


def test_get_activity_empty(client: TestClient, db: DBSession) -> None:
    """GET /api/v1/activity for user with no sessions returns empty list."""
    from app.models import UserCreate

    email = f"empty-{uuid.uuid4().hex[:8]}@test.com"
    password = random_lower_string()
    user = crud.create_user(
        session=db, user_create=UserCreate(email=email, password=password)
    )
    headers = user_authentication_headers(
        client=client, email=email, password=password
    )

    response = client.get(f"{settings.API_V1_STR}/activity", headers=headers)
    assert response.status_code == 200
    assert response.json() == []


def test_get_activity_limit(client: TestClient, db: DBSession) -> None:
    """GET /api/v1/activity?limit=3 returns at most 3 events."""
    events = [
        (i, "taskComplete", {"type": "taskComplete", "seq": i})
        for i in range(1, 11)
    ]
    user, password, email, sess = _setup_user_with_session_and_events(db, events)
    headers = user_authentication_headers(
        client=client, email=email, password=password
    )

    response = client.get(
        f"{settings.API_V1_STR}/activity?limit=3", headers=headers
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 3


def test_activity_event_filter() -> None:
    """ACTIVITY_EVENT_TYPES contains exactly the D-08 set and excludes non-qualifying types."""
    expected = {
        "task",
        "taskComplete",
        "taskError",
        "permissionRequest",
        "question",
        "session_created",
        "session_stopped",
    }
    assert ACTIVITY_EVENT_TYPES == expected

    # Must NOT contain raw stream types
    for excluded in ("stream", "ack", "heartbeat", "hello", "welcome"):
        assert excluded not in ACTIVITY_EVENT_TYPES


def test_activity_sse_stream_requires_auth(client: TestClient) -> None:
    """SSE stream endpoint requires authentication (returns 401/403 without token).

    Full SSE streaming verification requires an async test client with
    cancellation support; synchronous TestClient blocks on the infinite generator.
    This test validates auth enforcement on the endpoint.
    """
    response = client.get(f"{settings.API_V1_STR}/activity/stream")
    # Without auth, should get 401 or 403
    assert response.status_code in (401, 403)
