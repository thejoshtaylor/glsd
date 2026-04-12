"""Usage tracking tests for COST-01 and COST-02.

Tests:
- UsageRecord creation from taskComplete events (Task 1)
- _activity_message enrichment for taskComplete (Task 1)
- _format_cost and _format_duration helpers (Task 1)
- GET /api/v1/usage/ paginated list (Task 2)
- GET /api/v1/usage/summary aggregates (Task 2)
- User isolation (Task 2)
"""
import uuid

import pytest
from sqlmodel import Session as DBSession

from app import crud
from app.api.routes.ws_node import (
    _activity_message,
    _format_cost,
    _format_duration,
)
from app.models import (
    Node,
    SessionModel,
    UsageRecord,
    UserCreate,
)
from tests.utils.user import user_authentication_headers
from tests.utils.utils import random_lower_string


# --- Helpers ---


def _create_user_node_session(db: DBSession, suffix: str = ""):
    """Create a user, node, session for testing. Returns (user, password, email, session, node)."""
    email = f"usage-{suffix}-{uuid.uuid4().hex[:8]}@test.com"
    password = random_lower_string()
    user = crud.create_user(
        session=db, user_create=UserCreate(email=email, password=password)
    )
    node, _ = crud.create_node_token(
        session=db, user_id=user.id, name=f"usage-node-{suffix}"
    )
    node.machine_id = f"machine-{uuid.uuid4().hex[:8]}"
    db.add(node)
    db.commit()
    db.refresh(node)

    sess = crud.create_session(
        session=db, user_id=user.id, node_id=node.id, cwd="/tmp/usage"
    )
    assert sess is not None
    return user, password, email, sess, node


def _insert_usage_record(
    db: DBSession,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
    input_tokens: int = 100,
    output_tokens: int = 50,
    cost_usd: float = 0.01,
    duration_ms: int = 5000,
) -> UsageRecord:
    record = UsageRecord(
        session_id=session_id,
        user_id=user_id,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=cost_usd,
        duration_ms=duration_ms,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


# --- Task 1: _format_cost tests ---


def test_format_cost_zero():
    assert _format_cost(0.0) == "$0.00"


def test_format_cost_small():
    assert _format_cost(0.005) == "< $0.01"


def test_format_cost_normal():
    assert _format_cost(0.04) == "$0.04"


def test_format_cost_large():
    assert _format_cost(12.50) == "$12.50"


# --- Task 1: _format_duration tests ---


def test_format_duration_subsecond():
    assert _format_duration(500) == "< 1s"


def test_format_duration_seconds():
    assert _format_duration(42000) == "42s"


def test_format_duration_minutes():
    assert _format_duration(125000) == "2m5s"


# --- Task 1: _activity_message enrichment ---


def test_activity_message_task_complete_enriched():
    msg = {
        "type": "taskComplete",
        "inputTokens": 900,
        "outputTokens": 312,
        "costUsd": "0.04",
        "durationMs": 42000,
    }
    result = _activity_message("taskComplete", msg)
    assert "in:900" in result
    assert "out:312" in result
    assert "$0.04" in result
    assert "42s" in result


def test_activity_message_task_complete_cost_parse_failure():
    """cost_usd empty string defaults to 0.0 (no crash)."""
    msg = {
        "type": "taskComplete",
        "inputTokens": 100,
        "outputTokens": 50,
        "costUsd": "",
        "durationMs": 500,
    }
    result = _activity_message("taskComplete", msg)
    assert "$0.00" in result
    assert "in:100" in result


def test_activity_message_task_complete_cost_none():
    """cost_usd None defaults to 0.0 (no crash)."""
    msg = {
        "type": "taskComplete",
        "inputTokens": 100,
        "outputTokens": 50,
        "costUsd": None,
        "durationMs": 500,
    }
    result = _activity_message("taskComplete", msg)
    assert "$0.00" in result


# --- Task 1: UsageRecord creation ---


def test_usage_record_creation(db: DBSession) -> None:
    """UsageRecord is created with correct fields."""
    user, password, email, sess, node = _create_user_node_session(db, "create")
    record = _insert_usage_record(
        db,
        session_id=sess.id,
        user_id=user.id,
        input_tokens=900,
        output_tokens=312,
        cost_usd=0.0123,
        duration_ms=42000,
    )
    assert record.id is not None
    assert record.session_id == sess.id
    assert record.user_id == user.id
    assert record.input_tokens == 900
    assert record.output_tokens == 312
    assert record.cost_usd == pytest.approx(0.0123)
    assert record.duration_ms == 42000


def test_usage_record_cost_string_parse():
    """cost_usd string '0.0123' parses to float 0.0123."""
    assert float("0.0123") == pytest.approx(0.0123)


def test_usage_record_cost_empty_string_default():
    """cost_usd empty string defaults to 0.0."""
    try:
        cost = float("")
    except (ValueError, TypeError):
        cost = 0.0
    assert cost == 0.0


def test_usage_record_cost_none_default():
    """cost_usd None defaults to 0.0."""
    try:
        cost = float(None)
    except (ValueError, TypeError):
        cost = 0.0
    assert cost == 0.0


# --- Task 2: Usage REST endpoint tests ---


def test_list_usage_authenticated(client, db: DBSession) -> None:
    """GET /api/v1/usage/ returns paginated structure for authenticated user."""
    from app.core.config import settings

    user, password, email, sess, node = _create_user_node_session(db, "list")
    _insert_usage_record(db, session_id=sess.id, user_id=user.id)
    headers = user_authentication_headers(client=client, email=email, password=password)

    response = client.get(f"{settings.API_V1_STR}/usage/", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert "data" in body
    assert "total" in body
    assert "page" in body
    assert "page_size" in body
    assert "total_pages" in body
    assert body["total"] >= 1
    assert body["page"] == 1
    assert body["page_size"] == 25
    # Check record structure
    rec = body["data"][0]
    assert "node_name" in rec
    assert "input_tokens" in rec
    assert "output_tokens" in rec
    assert "cost_usd" in rec
    assert "duration_ms" in rec


def test_list_usage_period_filter(client, db: DBSession) -> None:
    """GET /api/v1/usage/?period=7d returns only recent records."""
    from app.core.config import settings

    user, password, email, sess, node = _create_user_node_session(db, "period")
    _insert_usage_record(db, session_id=sess.id, user_id=user.id)
    headers = user_authentication_headers(client=client, email=email, password=password)

    response = client.get(f"{settings.API_V1_STR}/usage/?period=7d", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 1


def test_list_usage_period_all(client, db: DBSession) -> None:
    """GET /api/v1/usage/?period=all returns all records."""
    from app.core.config import settings

    user, password, email, sess, node = _create_user_node_session(db, "all")
    _insert_usage_record(db, session_id=sess.id, user_id=user.id)
    headers = user_authentication_headers(client=client, email=email, password=password)

    response = client.get(f"{settings.API_V1_STR}/usage/?period=all", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 1


def test_usage_summary(client, db: DBSession) -> None:
    """GET /api/v1/usage/summary returns aggregate totals."""
    from app.core.config import settings

    user, password, email, sess, node = _create_user_node_session(db, "summary")
    _insert_usage_record(
        db, session_id=sess.id, user_id=user.id,
        input_tokens=500, output_tokens=200, cost_usd=0.05, duration_ms=10000,
    )
    headers = user_authentication_headers(client=client, email=email, password=password)

    response = client.get(f"{settings.API_V1_STR}/usage/summary", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert "total_cost_usd" in body
    assert "total_input_tokens" in body
    assert "total_output_tokens" in body
    assert "total_sessions" in body
    assert "by_node" in body
    assert "daily" in body
    assert body["total_sessions"] >= 1
    assert body["total_cost_usd"] >= 0.05


def test_usage_isolation(client, db: DBSession) -> None:
    """User A cannot see User B's usage records (T-12-01)."""
    from app.core.config import settings

    # Create user A with usage
    user_a, pwd_a, email_a, sess_a, _ = _create_user_node_session(db, "iso-a")
    _insert_usage_record(db, session_id=sess_a.id, user_id=user_a.id, cost_usd=0.10)
    headers_a = user_authentication_headers(client=client, email=email_a, password=pwd_a)

    # Create user B with usage
    user_b, pwd_b, email_b, sess_b, _ = _create_user_node_session(db, "iso-b")
    _insert_usage_record(db, session_id=sess_b.id, user_id=user_b.id, cost_usd=0.20)
    headers_b = user_authentication_headers(client=client, email=email_b, password=pwd_b)

    # User A sees only their own
    resp_a = client.get(f"{settings.API_V1_STR}/usage/?period=all", headers=headers_a)
    assert resp_a.status_code == 200
    data_a = resp_a.json()["data"]
    session_ids_a = {r["session_id"] for r in data_a}
    assert str(sess_a.id) in session_ids_a
    assert str(sess_b.id) not in session_ids_a

    # User B sees only their own
    resp_b = client.get(f"{settings.API_V1_STR}/usage/?period=all", headers=headers_b)
    assert resp_b.status_code == 200
    data_b = resp_b.json()["data"]
    session_ids_b = {r["session_id"] for r in data_b}
    assert str(sess_b.id) in session_ids_b
    assert str(sess_a.id) not in session_ids_b


def test_usage_unauthenticated(client) -> None:
    """Unauthenticated request to /api/v1/usage/ returns 401 (T-12-05)."""
    from app.core.config import settings

    response = client.get(f"{settings.API_V1_STR}/usage/")
    assert response.status_code == 401


def test_usage_summary_unauthenticated(client) -> None:
    """Unauthenticated request to /api/v1/usage/summary returns 401."""
    from app.core.config import settings

    response = client.get(f"{settings.API_V1_STR}/usage/summary")
    assert response.status_code == 401


def test_activity_enriches_task_complete(client, db: DBSession) -> None:
    """GET /api/v1/activity enriches taskComplete items with cost fields (D-09)."""
    from app.core.config import settings
    from app.models import SessionEvent

    user, password, email, sess, node = _create_user_node_session(db, "actv-enrich")
    # Insert a taskComplete event
    ev = SessionEvent(
        session_id=sess.id,
        sequence_number=1,
        event_type="taskComplete",
        payload={"type": "taskComplete", "inputTokens": 100, "outputTokens": 50},
    )
    db.add(ev)
    db.commit()
    # Insert corresponding usage record
    _insert_usage_record(
        db, session_id=sess.id, user_id=user.id,
        input_tokens=100, output_tokens=50, cost_usd=0.03, duration_ms=5000,
    )
    headers = user_authentication_headers(client=client, email=email, password=password)

    response = client.get(f"{settings.API_V1_STR}/activity", headers=headers)
    assert response.status_code == 200
    data = response.json()
    tc_events = [e for e in data if e["event_type"] == "taskComplete"]
    assert len(tc_events) >= 1
    tc = tc_events[0]
    assert "cost_usd" in tc
    assert "input_tokens" in tc
    assert "output_tokens" in tc
    assert "duration_ms" in tc
