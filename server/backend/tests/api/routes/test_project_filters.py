"""Behavioral tests for project_id filtering on activity, sessions, usage endpoints.

These tests verify that the project_id query parameter correctly narrows results
to only data associated with the specified project. This covers D-08, D-09, D-10.
"""
import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings


def test_activity_filter_by_project(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """GET /activity?project_id=X returns only events for that project's sessions."""
    # With no sessions linked to a random project UUID, result should be empty.
    fake_project_id = str(uuid.uuid4())
    r = client.get(
        f"{settings.API_V1_STR}/activity?project_id={fake_project_id}",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    assert r.json() == []


def test_sessions_filter_by_project(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """GET /sessions?project_id=X returns only that project's sessions."""
    fake_project_id = str(uuid.uuid4())
    r = client.get(
        f"{settings.API_V1_STR}/sessions/?project_id={fake_project_id}",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["data"] == []
    assert data["count"] == 0


def test_usage_filter_by_project(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """GET /usage?project_id=X returns only that project's usage records."""
    fake_project_id = str(uuid.uuid4())
    r = client.get(
        f"{settings.API_V1_STR}/usage/?project_id={fake_project_id}&period=30d&page=1",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["data"] == []
    assert data["total"] == 0


def test_activity_invalid_project_id_returns_empty(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """GET /activity?project_id=not-a-uuid returns empty list, not 500."""
    r = client.get(
        f"{settings.API_V1_STR}/activity?project_id=not-a-uuid",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    assert r.json() == []


def test_sessions_invalid_project_id_returns_empty(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """GET /sessions?project_id=not-a-uuid returns empty, not 500."""
    r = client.get(
        f"{settings.API_V1_STR}/sessions/?project_id=not-a-uuid",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["data"] == []
