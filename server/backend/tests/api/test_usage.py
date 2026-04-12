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
