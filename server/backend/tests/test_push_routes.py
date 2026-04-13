"""Unit tests for push API routes."""
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_get_vapid_key_requires_auth(client):
    """VAPID public key endpoint requires authentication."""
    resp = client.get("/api/v1/push/vapid-key")
    assert resp.status_code == 401


def test_subscribe_requires_auth(client):
    """Subscribe endpoint requires authentication."""
    resp = client.post("/api/v1/push/subscribe", json={
        "endpoint": "https://push.example.com",
        "p256dh": "key",
        "auth": "auth",
    })
    assert resp.status_code == 401


def test_respond_requires_auth(client):
    """Respond endpoint requires authentication."""
    resp = client.post("/api/v1/push/respond", json={
        "session_id": "s1",
        "request_id": "r1",
        "approved": True,
    })
    assert resp.status_code == 401
